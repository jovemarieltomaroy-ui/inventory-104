import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Search, Calendar } from 'lucide-react';

// --- RBAC CONSTANTS ---
const ROLES = {
  SUPERADMIN: 1,
  ADMIN: 2,
  USER: 3
};

// --- FEEDBACK MODAL (UPDATED: No Icons, Colored Text, Tighter Spacing) ---
const FeedbackModal = ({ isOpen, type, message, onClose }) => {
  if (!isOpen) return null;

  const isSuccess = type === 'success';

  const title = isSuccess ? "Success" : "Notice";
  const btnText = isSuccess ? "Continue" : "Close";
  
  // UPDATED THEME COLORS
  const theme = isSuccess 
    ? { text: '#059669', btn: '#059669', hover: '#047857' } // Green
    : { text: '#921a1d', btn: '#921a1d', hover: '#751417' }; // Red

  return (
    <div className="overlay" style={{ zIndex: 2000 }} onClick={isSuccess ? undefined : onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* HEADER: No Icon, Just Colored Text */}
        <div className="modal-header-group">
            <h3 className="modal-title" style={{ color: theme.text }}>
                {title}
            </h3>
        </div>

        <p className="modal-desc">{message || "An unexpected issue occurred."}</p>
        
        {/* ACTIONS: Positioned Bottom Right */}
        <div className="modal-actions-single">
          <button 
            className="btn-modal" 
            onClick={onClose}
            style={{ backgroundColor: theme.btn }}
            onMouseOver={(e) => e.target.style.backgroundColor = theme.hover}
            onMouseOut={(e) => e.target.style.backgroundColor = theme.btn}
          >
            {btnText}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- CUSTOM DROPDOWN ---
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

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder;

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

// --- MAIN COMPONENT ---
const BorrowItem = () => {
  const navigate = useNavigate();
  // Mock user for example purposes; replace with your actual auth logic
  const user = JSON.parse(localStorage.getItem('user')) || { roleId: 3, fullName: "Test User", id: 1 };

  const [selectedItem, setSelectedItem] = useState("");
  const [borrower, setBorrower] = useState(user.roleId === ROLES.USER ? user.fullName : "");
  const [committee, setCommittee] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [dateBorrowed, setDateBorrowed] = useState(new Date().toISOString().split('T')[0]);
  const [expReturnDate, setExpReturnDate] = useState("");
  
  const [itemOptions, setItemOptions] = useState([]);
  const [committeeOptions, setCommitteeOptions] = useState([]);

  const [modalState, setModalState] = useState({
    isOpen: false, type: 'error', message: '', onConfirm: null 
  });

  const handleClose = () => navigate(-1);
  const increment = () => setQuantity(prev => prev + 1);
  const decrement = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));
  const isUser = user.roleId === ROLES.USER;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const itemsRes = await fetch('http://localhost:5000/api/inventory');
        const itemsData = await itemsRes.json();
        const availableItems = itemsData.filter(i => i.availableQty > 0 || !isUser); 
        const formattedItems = availableItems.map(i => ({
           value: i.id,
           label: `${i.name} (${i.code})`
        }));
        setItemOptions(formattedItems);

        const refRes = await fetch('http://localhost:5000/api/inventory/references');
        const refData = await refRes.json();
        setCommitteeOptions(refData.committees);
      } catch (error) {
        console.error("Error loading options:", error);
      }
    };
    fetchData();
  }, [navigate, isUser]);

  const showFeedback = (type, message, onConfirm = null) => {
    setModalState({ isOpen: true, type, message, onConfirm });
  };

  const handleModalClose = () => {
    const { onConfirm } = modalState;
    setModalState({ ...modalState, isOpen: false });
    if (onConfirm) onConfirm();
  };

  const handleConfirm = async () => {
    if (!selectedItem || !borrower || !committee || !dateBorrowed || !expReturnDate) {
        showFeedback('error', "Please fill in all required fields.");
        return;
    }
    if (new Date(expReturnDate) < new Date(dateBorrowed)) {
        showFeedback('error', "Return date cannot be before the borrow date.");
        return;
    }

    const payload = {
        itemID: selectedItem, borrowerName: borrower, committeeID: committee,
        quantity: Number(quantity), dateBorrowed: dateBorrowed, expectedReturn: expReturnDate,
        userID: user.id, roleID: user.roleId 
    };

    try {
        const response = await fetch('http://localhost:5000/api/borrowing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) {
            showFeedback('success', result.message, () => navigate('/dashboard/borrowing'));
        } else {
            showFeedback('error', result.message);
        }
    } catch (error) {
        showFeedback('error', "Server connection failed. Please try again.");
    }
  };

  return (
    <div className="overlay-page">
      <div className="container-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
            <h2 className="title" style={{color: '#3B82F6'}}>BORROW ITEM</h2>
            <p className="subtitle">Fill in the details below to process the transaction.</p>
        </div>
        
        <div className="formBody">
          
          <div className="row">
            <div className="col-2">
                <label className="field-label">Select Item</label>
                <CustomDropdown options={itemOptions} placeholder="Search item name or code..." value={selectedItem} onChange={setSelectedItem} />
            </div>
            <div className="col-small">
                <label className="field-label">Quantity</label>
                <div className="quantity-wrapper">
                    <button type="button" onClick={decrement} className="qty-btn">-</button>
                    <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="qty-input" />
                    <button type="button" onClick={increment} className="qty-btn">+</button>
                </div>
            </div>
          </div>

          <div className="row">
            <div className="col-1">
                <label className="field-label">Borrower Name</label>
                <input type="text" placeholder="Enter full name" value={borrower} onChange={(e) => setBorrower(e.target.value)} className="text-input" disabled={isUser} />
            </div>
            <div className="col-1">
                <label className="field-label">Committee</label>
                <CustomDropdown options={committeeOptions} placeholder="Select Committee" value={committee} onChange={setCommittee} />
            </div>
          </div>

          <div className="row">
             <div className="col-1">
                <label className="field-label">Date Borrowed</label>
                <div className="input-with-icon">
                    <input type="date" value={dateBorrowed} onChange={(e) => setDateBorrowed(e.target.value)} className="date-input" />
                    <Calendar size={16} className="calendar-icon-overlay" />
                </div>
            </div>
            <div className="col-1">
                <label className="field-label">Expected Return</label>
                <div className="input-with-icon">
                    <input type="date" placeholder="dd/mm/yyyy" value={expReturnDate} min={dateBorrowed} onChange={(e) => setExpReturnDate(e.target.value)} className="date-input" />
                    <Calendar size={16} className="calendar-icon-overlay" />
                </div>
            </div>
          </div>

          <div className="form-footer">
             <button onClick={handleClose} className="cancelBtn" style={{color: '#921a1d'}}>Cancel</button>
             <button onClick={handleConfirm} className="saveBtn" style={{ backgroundColor: isUser ? '#921a1d' : '#1E75D8' }}>
                {isUser ? "Submit Request" : "Confirm Borrow"}
             </button>
          </div>

        </div>
      </div>

      <FeedbackModal isOpen={modalState.isOpen} type={modalState.type} message={modalState.message} onClose={handleModalClose} />
      
      <style>{`
        /* --- LAYOUT --- */
        .overlay-page {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex; justify-content: center; align-items: center;
            z-index: 1000; backdrop-filter: blur(3px);
        }
        .container-card { 
            background: white; padding: 32px; border-radius: 12px; 
            width: 90%; max-width: 650px; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.1); 
            animation: slideUp 0.3s ease-out;
        }
        .card-header { margin-bottom: 24px; text-align: center; }
        .title { font-size: 26px; font-weight: 800; margin: 0; text-transform: uppercase; }
        .subtitle { font-size: 14px; color: #6B7280; margin-top: 8px; }

        /* --- FORM ELEMENTS --- */
        .formBody { display: flex; flex-direction: column; gap: 20px; }
        .row { display: flex; gap: 20px; align-items: flex-end; }
        .col-1 { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .col-2 { flex: 2; display: flex; flex-direction: column; gap: 6px; }
        .col-small { width: 130px; display: flex; flex-direction: column; gap: 6px; }
        
        .field-label { 
            font-size: 13px; font-weight: 600; color: #4B5563; 
            margin-bottom: 2px; display: block; 
        }
        
        .text-input,
        .date-input,
        .custom-select-trigger,
        .quantity-wrapper {
            height: 45px; 
            min-height: 45px;
            width: 100%;
            border: 1px solid #E5E7EB; 
            border-radius: 8px; 
            background: #fff;
            box-sizing: border-box; 
            transition: all 0.2s;
            font-size: 14px;
        }

        .text-input { padding: 0 12px; outline: none; color: #1F2937; }
        .text-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .text-input:disabled { background: #F3F4F6; color: #9CA3AF; cursor: not-allowed; }

        .quantity-wrapper { display: flex; align-items: center; overflow: hidden; }
        .qty-btn { 
            height: 100%; width: 40px; background: #F9FAFB; border: none; 
            cursor: pointer; font-weight: bold; color: #374151; display: flex; align-items: center; justify-content: center; font-size: 16px;
        }
        .qty-btn:hover { background: #E5E7EB; }
        .qty-input { flex: 1; height: 100%; border: none; text-align: center; outline: none; font-size: 15px; font-weight: 600; -moz-appearance: textfield; }
        .qty-input::-webkit-outer-spin-button, .qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        .input-with-icon { position: relative; width: 100%; }
        .date-input { padding: 0 12px; padding-right: 35px; color: #1F2937; outline: none; cursor: pointer; }
        .date-input:focus { border-color: #3B82F6; }
        .date-input::-webkit-calendar-picker-indicator { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
        .calendar-icon-overlay { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #6B7280; pointer-events: none; }

        .form-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; border-top: 1px solid #eee; padding-top: 24px; }
        .cancelBtn { padding: 0 24px; height: 45px; border: 1px solid #D1D5DB; background: white; border-radius: 8px; cursor: pointer; color: #374151; font-weight: 500; }
        .cancelBtn:hover { background: #F3F4F6; }
        .saveBtn { padding: 0 24px; height: 45px; border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: 500; transition: opacity 0.2s; }
        .saveBtn:hover { opacity: 0.9; }

        .custom-select-container { position: relative; width: 100%; }
        .custom-select-trigger { display: flex; justify-content: space-between; align-items: center; padding: 0 12px; cursor: pointer; color: #1F2937; }
        .custom-select-trigger.open { border-color: #3B82F6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .arrow { transition: transform 0.2s; color: #6B7280; }
        .arrow.rotated { transform: rotate(180deg); }

        .custom-options-list { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #E5E7EB; border-radius: 8px; margin-top: 6px; z-index: 50; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden; animation: popIn 0.1s ease-out; }
        .dropdown-search-container { padding: 10px; border-bottom: 1px solid #F3F4F6; display: flex; align-items: center; gap: 8px; }
        .dropdown-search-input { border: none; outline: none; width: 100%; font-size: 14px; color: #374151; }
        .options-scroll-area { max-height: 220px; overflow-y: auto; }
        .custom-option { padding: 10px 12px; cursor: pointer; font-size: 14px; color: #374151; display: flex; justify-content: space-between; align-items: center; }
        .custom-option:hover { background: #F9FAFB; color: #111827; }
        .custom-option.selected { background: #EFF6FF; color: #2563EB; font-weight: 500; }
        .check-icon { color: #2563EB; }
        .no-results { padding: 12px; text-align: center; color: #9CA3AF; font-size: 13px; }

        /* --- UPDATED MODAL CSS --- */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; backdrop-filter: blur(2px); }
        
        .modal-container { 
            background: white; 
            padding: 20px; /* Reduced from 24px */
            border-radius: 12px; 
            width: 90%; 
            max-width: 340px; 
            text-align: center; 
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); 
            animation: popIn 0.2s; 
        }
        
        .modal-header-group { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin-bottom: 8px; /* Reduced from 16px */
            width: 100%;
        }
        
        .modal-title { 
            font-size: 20px; 
            font-weight: 700; 
            margin: 0; 
            line-height: 1.1; /* Tighter line height */
            text-align: center;
        }
        
        .modal-desc { 
            font-size: 14px; 
            color: #6B7280; 
            margin-bottom: 16px; /* Reduced from 24px */
            line-height: 1.3; /* Tighter line height */
        }

        .modal-actions-single {
            width: 100%;
            display: flex;
            justify-content: flex-end; 
            margin-top: 16px; /* Reduced from 24px */
        }

        .btn-modal { 
            width: auto; 
            min-width: 90px; 
            padding: 8px 20px; 
            border-radius: 6px; 
            border: none; 
            color: white; 
            font-weight: 500; 
            cursor: pointer; 
            transition: background 0.2s; 
            font-size: 14px;
        }

        @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default BorrowItem;