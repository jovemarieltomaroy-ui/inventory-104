import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ChevronDown, Check } from 'lucide-react';

// --- RBAC CONSTANTS ---
const ROLES = {
  SUPERADMIN: 1,
  ADMIN: 2,
  USER: 3
};

// --- CUSTOM DROPDOWN---
const CustomDropdown = ({ options, placeholder, value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  // Find label corresponding to the value ID
  const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

  return (
    <div className={`custom-select-container ${className || ''}`}>
      <div 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedLabel}
        </span>
        <ChevronDown size={16} className={`arrow ${isOpen ? 'rotated' : ''}`} />
      </div>
      {isOpen && (
        <div className="custom-options-list">
          {options.map((option) => (
            <div 
              key={option.value} 
              className={`custom-option ${value === option.value ? 'selected' : ''}`}
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
              {value === option.value && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EditItem = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Get User for RBAC from LocalStorage
  const user = JSON.parse(localStorage.getItem('user')) || {};

  // --- DATA INITIALIZATION ---
  const itemData = location.state?.itemData || {};

  // --- STATES ---
  const [itemCode, setItemCode] = useState(itemData.code || "");
  const [itemName, setItemName] = useState(itemData.name || "");
  const [quantity, setQuantity] = useState(itemData.totalQty || itemData.quantity || 0);
  
  const [committee, setCommittee] = useState(itemData.committeeID || "");
  const [type, setType] = useState(itemData.typeID || "");
  const [loc, setLoc] = useState(itemData.location || "");
  const [unit, setUnit] = useState(itemData.unitID || ""); 

  // Options State
  const [committeeOptions, setCommitteeOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [unitOptions, setUnitOptions] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // --- 1. INITIAL LOAD & SECURITY CHECK ---
  useEffect(() => {
    // RBAC Security Check: If User is Role 3, Kick them out.
    if (user.roleId === ROLES.USER) {
        alert("Access Denied: You do not have permission to edit items.");
        navigate('/dashboard/inventory');
        return;
    }

    // Safety Check: If no item ID (e.g. direct URL access/refresh), warn user
    if (!id && !itemData.id) {
       alert("No item selected. Returning to inventory.");
       navigate('/dashboard/inventory');
       return;
    }

    const fetchOptions = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/inventory/references');
            if (res.ok) {
                const data = await res.json();
                setCommitteeOptions(data.committees);
                setTypeOptions(data.types);
                setUnitOptions(data.units);
            }
        } catch (error) {
            console.error("Error fetching options:", error);
        } finally {
            setLoading(false);
        }
    };
    fetchOptions();
  }, [user.roleId, navigate, id, itemData.id]);

  const handleClose = () => {
    navigate(-1);
  };

  const increment = () => setQuantity(prev => prev + 1);
  const decrement = () => setQuantity(prev => (prev > 0 ? prev - 1 : 0));

 // --- 2. HANDLE UPDATE ---
  const handleUpdate = async () => {
    if(!itemName || !committee || !type || !unit) {
        alert("Please fill in all required fields.");
        return;
    }

    setIsSaving(true);

    const payload = {
        itemName,
        committeeID: committee,
        typeID: type,
        quantity,
        unitID: unit,
        location: loc,
        roleID: user.roleId,
        userID: user.id 
    };

    try {

        const targetId = id || itemData.id;

        const res = await fetch(`http://localhost:5000/api/inventory/${targetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            navigate('/dashboard/inventory'); 
        } else {
            alert(data.message || "Error updating item");
        }
    } catch (error) {
        console.error("Update error:", error);
        alert("Failed to connect to server.");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={handleClose}>
      <div className="container" onClick={(e) => e.stopPropagation()}>
        
        <h2 className="title">EDIT ITEM</h2>

        <div className="formBody">
          {loading ? (
             <div style={{textAlign:'center', padding:'20px'}}>Loading Options...</div>
          ) : (
            <>
                {/* Row 1: Item Code (Read Only) */}
                <div className="centerRow">
                    <input 
                        type="text" 
                        value={itemCode} 
                        readOnly 
                        className="item-code-input read-only-input" 
                        style={{ backgroundColor: '#f0f0f0', color: '#555', fontWeight: 'bold', textAlign: 'center', cursor: 'not-allowed' }}
                        title="Item Code cannot be changed"
                    />
                </div>

                {/* Row 2: Name & Committee */}
                <div className="row">
                    <input 
                        type="text" 
                        placeholder="Item Name" 
                        value={itemName} 
                        onChange={(e) => setItemName(e.target.value)}
                        className="col-1"
                    />
                    
                    <CustomDropdown 
                    className="col-1"
                    options={committeeOptions}
                    placeholder="Select Committee"
                    value={committee}
                    onChange={setCommittee}
                    />
                </div>

                {/* Row 3: Type, Unit, & Quantity */}
                <div className="row">
                    {/* 1. Type gets 'col-2'*/}
                    <CustomDropdown 
                    className="col-2"
                    options={typeOptions}
                    placeholder="Select Type"
                    value={type}
                    onChange={setType}
                    />

                    {/* 2. Unit gets 'col-1' */}
                    <CustomDropdown 
                    className="col-1"
                    options={unitOptions}
                    placeholder="Unit"
                    value={unit}
                    onChange={setUnit}
                    />

                    {/* 3. Quantity */}
                    <div className="quantity-wrapper col-small">
                    <button type="button" onClick={decrement} className="qty-btn">-</button>
                    <input 
                        type="number" 
                        value={quantity} 
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="qty-input" 
                    />
                    <button type="button" onClick={increment} className="qty-btn">+</button>
                    </div>
                </div>

                {/* Row 4: Location & Buttons */}
                <div className="row">
                    <input 
                        type="text" 
                        placeholder="Location" 
                        value={loc} 
                        onChange={(e) => setLoc(e.target.value)}
                        className="col-1" 
                    />
                    
                    <div className="buttonGroup col-auto"> 
                    <button onClick={handleClose} className="cancelBtn">Cancel</button>
                    <button 
                        onClick={handleUpdate} 
                        className="saveBtn" 
                        disabled={isSaving}
                        style={{ backgroundColor: '#1565c0' }}
                    >
                        {isSaving ? "Updating..." : "Update"}
                    </button>
                    </div>
                </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditItem;