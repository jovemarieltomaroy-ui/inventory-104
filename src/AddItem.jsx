import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Search } from 'lucide-react'; // Added Search import

// --- RBAC CONSTANTS ---
const ROLES = {
  SUPERADMIN: 1,
  ADMIN: 2,
  USER: 3
};

// --- CUSTOM DROPDOWN (COPIED FROM BORROWITEM) ---
const CustomDropdown = ({ options, placeholder, value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm(""); 
  };

  // Safe check for options in case it's null/undefined
  const safeOptions = options || [];

  const filteredOptions = safeOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedLabel = safeOptions.find((opt) => opt.value === value)?.label || placeholder;

  return (
    <div className={`custom-select-container ${className || ''}`} ref={wrapperRef}>
      <div className={`custom-select-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: value ? '#1F2937' : '#9CA3AF' }}>
            {value ? selectedLabel : placeholder}
        </span>
        <ChevronDown size={16} className={`arrow ${isOpen ? 'rotated' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="custom-options-list">
          <div className="dropdown-search-container" onClick={(e) => e.stopPropagation()}>
            <Search size={14} color="#888" />
            <input 
                autoFocus 
                type="text" 
                placeholder="Search..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="dropdown-search-input"
            />
          </div>
          <div className="options-scroll-area">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div key={option.value} className={`custom-option ${value === option.value ? 'selected' : ''}`} onClick={() => handleSelect(option.value)}>
                  {option.label}
                  {value === option.value && <Check size={14} className="check-icon" />}
                </div>
              ))
            ) : (
              <div className="no-results">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AddItem = () => {
  const navigate = useNavigate();

  // --- USER DATA ---
  const user = JSON.parse(localStorage.getItem('user')) || {};

  // --- STATES ---
  const [itemName, setItemName] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  
  // Selection States
  const [committee, setCommittee] = useState("");
  const [type, setType] = useState("");
  const [unit, setUnit] = useState(""); 
  
  // Options State
  const [committeeOptions, setCommitteeOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [unitOptions, setUnitOptions] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // --- INITIAL LOAD & SECURITY CHECK ---
  useEffect(() => {
    if (user.roleId === ROLES.USER) {
        alert("Access Denied: You do not have permission to add items.");
        navigate('/dashboard/inventory');
        return;
    }

    const fetchOptions = async () => {
        try {
            // Note: Ensure this URL points to the correct endpoint. 
            // Based on BorrowItem, it might need to be '/api/inventory/references'
            // But I kept your original URL here.
            const res = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory/references'); 
            if (res.ok) {
                const data = await res.json();
                setCommitteeOptions(data.committees || []);
                setTypeOptions(data.types || []);
                setUnitOptions(data.units || []);
            }
        } catch (error) {
            console.error("Error fetching options:", error);
        } finally {
            setLoading(false);
        }
    };
    fetchOptions();
  }, [navigate, user.roleId]);

  const handleClose = () => {
    navigate(-1);
  };

  const increment = () => setQuantity(prev => prev + 1);
  const decrement = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  // --- HANDLE SAVE ---
  const handleSave = async () => {
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
        location,
        roleID: user.roleId, 
        userID: user.id     
    };

    try {
        const res = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            navigate('/dashboard/inventory'); 
        } else {
            alert(data.message || "Error adding item");
        }
    } catch (error) {
        console.error("Save error:", error);
        alert("Failed to connect to server.");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={handleClose}>
      <div className="container" onClick={(e) => e.stopPropagation()}>
        
        <h2 className="title">ADD ITEM</h2>

        <div className="formBody">
          {loading ? (
             <div style={{textAlign:'center', padding:'20px'}}>Loading Options...</div>
          ) : (
            <>
                {/* Row 1: Item Code */}
                <div className="centerRow">
                    <input 
                        type="text" 
                        value="Code Auto-generated (e.g. ITM-0005)" 
                        disabled
                        className="item-code-input"
                        style={{ backgroundColor: '#f0f0f0', color: '#888', fontStyle: 'italic' }}
                    />
                </div>

                {/* Row 2: Name & Committee */}
                <div className="row">
                    <input 
                        type="text" 
                        placeholder="Item Name" 
                        className="col-1 text-input" 
                        value={itemName}
                        onChange={(e) => setItemName(e.target.value)}
                    />
                    
                    <CustomDropdown 
                        className="col-1"
                        options={committeeOptions}
                        placeholder="Select Committee"
                        value={committee}
                        onChange={setCommittee}
                    />
                </div>

                {/* Row 3: Type, Unit, Quantity */}
                <div className="row">
                    {/* 1. Type */}
                    <CustomDropdown 
                        className="col-2" 
                        options={typeOptions}
                        placeholder="Select Type"
                        value={type}
                        onChange={setType}
                    />

                    {/* 2. Unit */}
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
                        placeholder="Location (Optional)" 
                        className="col-1 text-input" 
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                    />
                    
                    <div className="buttonGroup col-auto"> 
                        <button onClick={handleClose} className="cancelBtn">Cancel</button>
                        <button onClick={handleSave} className="saveBtn" disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            </>
          )}

        </div>
      </div>

      <style>{`
        /* --- LAYOUT & MODAL --- */
        .overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex; justify-content: center; align-items: center;
            z-index: 1000; backdrop-filter: blur(3px);
        }
        .container { 
            background: white; 
            padding: 40px; 
            border-radius: 20px; 
            width: 90%; 
            max-width: 700px;
            height: 80%;
            max-height: 600px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); 
            animation: slideUp 0.3s ease-out;
        }
        .title { 
            font-size: 24px; 
            font-weight: 800; 
            color: #3B82F6; 
            text-align: center; 
            margin-top: 0px; 
            margin-bottom: 25px;
            text-transform: uppercase; 
        }

        /* --- FORM GRID --- */
        .formBody { display: flex; flex-direction: column; gap: 15px; }
        .row { display: flex; gap: 15px; align-items: center; }
        .centerRow { display: flex; justify-content: center; margin-bottom: 5px; }
        
        .col-1 { flex: 1; }
        .col-2 { flex: 1.5; }
        .col-small { width: 120px; }
        .col-auto { width: auto; }

        /* --- INPUTS --- */
        .item-code-input {
            width: 100%; text-align: center; padding: 12px;
            border: none; border-radius: 8px; outline: none;
            font-size: 14px;
        }
        .text-input {
            height: 45px; padding: 0 15px; 
            border: 1px solid #E5E7EB; /* Added border to match dropdown */
            border-radius: 8px;
            font-size: 14px; outline: none; width: 100%; box-sizing: border-box;
            color: #1F2937;
        }
        .text-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }

        /* --- DROPDOWN (UPDATED CSS) --- */
        .custom-select-container { position: relative; width: 100%; }
        .custom-select-trigger { 
            height: 45px; 
            background: white; 
            border: 1px solid #E5E7EB; /* Changed to border */
            border-radius: 8px; 
            display: flex; justify-content: space-between; align-items: center; 
            padding: 0 15px; cursor: pointer; color: #1F2937; font-size: 14px;
        }
        .custom-select-trigger.open { border-color: #3B82F6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .arrow { color: #888; transition: transform 0.2s; }
        .arrow.rotated { transform: rotate(180deg); }
        
        .custom-options-list { 
            position: absolute; top: 110%; left: 0; right: 0; 
            background: white; 
            border: 1px solid #E5E7EB;
            border-radius: 8px; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
            z-index: 50; 
            overflow: hidden;
            animation: popIn 0.1s ease-out;
        }

        .dropdown-search-container { padding: 10px; border-bottom: 1px solid #F3F4F6; display: flex; align-items: center; gap: 8px; }
        .dropdown-search-input { border: none; outline: none; width: 100%; font-size: 14px; color: #374151; }
        
        .options-scroll-area { max-height: 200px; overflow-y: auto; }
        
        .custom-option { 
            padding: 10px 12px; cursor: pointer; font-size: 14px; color: #374151;
            display: flex; justify-content: space-between; align-items: center;
        }
        .custom-option:hover { background: #F9FAFB; color: #111827; }
        .custom-option.selected { background: #EFF6FF; color: #2563EB; font-weight: 500; }
        .check-icon { color: #2563EB; }
        .no-results { padding: 12px; text-align: center; color: #9CA3AF; font-size: 13px; }

        /* --- QUANTITY --- */
        .quantity-wrapper { 
            display: flex; align-items: center; background: white; 
            border: 1px solid #E5E7EB;
            border-radius: 8px; height: 45px; overflow: hidden; padding: 0 5px;
        }
        .qty-btn { 
            width: 30px; border: none; background: transparent; 
            font-weight: bold; font-size: 18px; color: #3B82F6; cursor: pointer; 
        }
        .qty-input { 
            flex: 1; border: none; text-align: center; font-weight: bold; font-size: 16px; outline: none; 
            width: 40px; 
            color: #374151;
        }
        .qty-input::-webkit-outer-spin-button, .qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        /* --- BUTTONS --- */
        .buttonGroup { display: flex; gap: 10px; }
        .cancelBtn {
             background: white; border: 1px solid #D1D5DB; padding: 0 20px; height: 45px; 
             border-radius: 25px; cursor: pointer; font-weight: 600; color: #666;
        }
        .saveBtn {
             background: #1D72E8; border: none; padding: 0 30px; height: 45px; 
             border-radius: 25px; cursor: pointer; font-weight: 600; color: white;
        }
        .saveBtn:hover { background: #1557b0; }

        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};

export default AddItem;