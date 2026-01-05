import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Filter, RotateCcw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'; 
import { CgArrowsExchange } from "react-icons/cg";

const ROLES = { SUPERADMIN: 1, ADMIN: 2, USER: 3 };

// --- UNIFIED CONFIRMATION MODAL ---
const ActionModal = ({ isOpen, onClose, onConfirm, config }) => {
  if (!isOpen || !config) return null;

  const { type, title, message, confirmText } = config;

  // Dynamic Styles based on type
  const getTheme = () => {
    switch (type) {
      case 'approve': return { bg: '#ECFDF5', text: '#059669', btn: '#059669', hover: '#047857', icon: <CheckCircle size={32} /> };
      case 'reject': return { bg: '#FEF2F2', text: '#DC2626', btn: '#DC2626', hover: '#B91C1C', icon: <XCircle size={32} /> };
      case 'return': return { bg: '#EFF6FF', text: '#2563EB', btn: '#2563EB', hover: '#1D4ED8', icon: <RotateCcw size={32} /> };
      default: return { bg: '#F3F4F6', text: '#374151', btn: '#374151', hover: '#1F2937', icon: <AlertTriangle size={32} /> };
    }
  };

  const theme = getTheme();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-icon" style={{ backgroundColor: theme.bg, color: theme.text }}>
            {theme.icon}
        </div>
        
        <h3 className="modal-title">{title}</h3>
        <p className="modal-desc">{message}</p>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn-confirm" 
            onClick={onConfirm}
            style={{ backgroundColor: theme.btn }}
            onMouseOver={(e) => e.target.style.backgroundColor = theme.hover}
            onMouseOut={(e) => e.target.style.backgroundColor = theme.btn}
          >
            {confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

const BorrowingPage = () => {
  const location = useLocation(); 
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const canManage = user.roleId === ROLES.SUPERADMIN || user.roleId === ROLES.ADMIN;

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Office Items");

  // --- MODAL STATE ---
  const [modalState, setModalState] = useState({
    isOpen: false,
    item: null,     
    action: null,   
  });

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`https://inventory-backend-yfyn.onrender.com/api/borrowing?_t=${Date.now()}`);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        // --- SORTING LOGIC ADDED HERE ---
        // Sorts by dateBorrowed Descending (Latest date first)
        const sortedData = data.sort((a, b) => 
            new Date(b.dateBorrowed) - new Date(a.dateBorrowed)
        );
        setTransactions(sortedData);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 3000);
    return () => clearInterval(interval);
  }, [location.key]);

  // --- ACTIONS HANDLERS ---
  const openConfirmModal = (action, item) => {
    setModalState({ isOpen: true, action, item });
  };

  const handleFinalConfirm = async () => {
    const { action, item } = modalState;
    if (!item || !action) return;

    await updateStatus(item.id, action);
    setModalState({ isOpen: false, item: null, action: null }); 
  };

  const updateStatus = async (id, action) => {
    let endpoint = '';
    if (action === 'approve') endpoint = `/api/borrowing/approve/${id}`;
    if (action === 'reject') endpoint = `/api/borrowing/reject/${id}`;
    if (action === 'return') endpoint = `/api/borrowing/return/${id}`;

    try {
        const res = await fetch(`https://inventory-backend-yfyn.onrender.com${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userID: user.id, roleID: user.roleId })
        });
        const data = await res.json();
        if(data.success) {
            fetchTransactions();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error("Action error", err);
    }
  };

  // --- CONFIG GENERATOR FOR MODAL ---
  const getModalConfig = () => {
    const { action, item } = modalState;
    if (!action || !item) return null;

    if (action === 'approve') {
        return {
            type: 'approve',
            title: 'Approve Request',
            message: <>Are you sure you want to approve the request for <strong>"{item.name}"</strong> by <strong>{item.borrower}</strong>?</>,
            confirmText: 'Yes, Approve'
        };
    }
    if (action === 'reject') {
        return {
            type: 'reject',
            title: 'Reject Request',
            message: <>Are you sure you want to <strong>reject</strong> this request? This action cannot be undone.</>,
            confirmText: 'Reject Request'
        };
    }
    if (action === 'return') {
        return {
            type: 'return',
            title: 'Confirm Return',
            message: <>Has <strong>{item.borrower}</strong> returned the item <strong>"{item.name}"</strong> to the inventory?</>,
            confirmText: 'Confirm Return'
        };
    }
  };

  // --- FILTERING ---
  const filteredData = transactions.filter((item) => {
    const matchesSearch = 
      (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.borrower || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchTerm.toLowerCase());

    let matchesCategory = true;
    if (filterCategory === "Pending") matchesCategory = item.status === "Pending";
    if (filterCategory === "Returned") matchesCategory = item.status === "Returned";
    if (filterCategory === "Overdue") matchesCategory = item.status === "Overdue";
    if (filterCategory === "Rejected") matchesCategory = item.status === "Rejected";

    return matchesSearch && matchesCategory;
  });

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Pending': return { backgroundColor: '#FFF8E1', color: '#F57C00', border: '1px solid #FFE0B2' }; 
      case 'Returned': return { backgroundColor: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }; 
      case 'Borrowed': return { backgroundColor: '#E3F2FD', color: '#1565C0', border: '1px solid #90CAF9' }; 
      case 'Overdue': return { backgroundColor: '#FFEBEE', color: '#C62828', border: '1px solid #EF9A9A' }; 
      case 'Rejected': return { backgroundColor: '#FAFAFA', color: '#9E9E9E', border: '1px solid #E0E0E0', textDecoration: 'line-through' }; 
      default: return { backgroundColor: '#F5F5F5', color: '#616161', border: '1px solid #E0E0E0' }; 
    }
  };

  return (
    <div className="inventory-container">
      <div className="page-header">
        <div className="header-titles">
          <h1>Borrowing</h1>
          <p>Track borrowed items, requests, and returns.</p>
        </div>
      </div>

      <div className="controls-card">
         <div className="filters-group">
            <div className="select-wrapper">
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="filter-select">
                    <option value="All Office Items">All Office Items</option>
                    <option value="Pending">Pending Requests</option>
                    <option value="Overdue">Overdue Items</option>
                    <option value="Returned">Returned Items</option>
                    <option value="Rejected">Rejected</option>
                </select>
                <Filter size={14} className="select-icon" />
            </div>
            <div className="search-wrapper">
                <Search className="search-icon" size={20} />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
         </div>
         
         <Link to="/dashboard/borrow-item" state={{ background: location }} className="add-btn" style={{ textDecoration: 'none' }}>
            <CgArrowsExchange size={18} />
            <span>{canManage ? "Borrow Item" : "Request Item"}</span>
         </Link>
      </div>

      <div className="table-card">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Borrower</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Date Borrowed</th>
              <th>Expected</th>
              <th>Returned</th>
              {canManage && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? ( <tr><td colSpan="9" style={{textAlign:'center', padding:'20px'}}>Loading...</td></tr> ) : 
             filteredData.length > 0 ? (
              filteredData.map((item) => (
                <tr key={item.id}>
                  <td className="code-cell">{item.code}</td>
                  <td className="name-cell">{item.name}</td>
                  <td>{item.borrower}</td>
                  <td>{item.qty}</td>
                  <td>
                    <span className="type-badge" style={getStatusBadgeStyle(item.status)}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.dateBorrowed}</td>
                  <td>{item.dateExpected}</td>
                  <td>{item.dateReturned}</td>
                  {canManage && (
                    <td>
                        {item.status === 'Pending' && (
                            <div style={{display:'flex', gap:'5px'}}>
                                <button 
                                    onClick={() => openConfirmModal('approve', item)} 
                                    title="Approve" 
                                    style={{background:'#E8F5E9', border:'1px solid #A5D6A7', color:'#2E7D32', borderRadius:'4px', padding:'4px', cursor:'pointer'}}
                                >
                                    <CheckCircle size={16}/>
                                </button>
                                <button 
                                    onClick={() => openConfirmModal('reject', item)} 
                                    title="Reject" 
                                    style={{background:'#FFEBEE', border:'1px solid #EF9A9A', color:'#C62828', borderRadius:'4px', padding:'4px', cursor:'pointer'}}
                                >
                                    <XCircle size={16}/>
                                </button>
                            </div>
                        )}
                        {(item.status === 'Borrowed' || item.status === 'Overdue') && (
                            <button className="action-btn-return" onClick={() => openConfirmModal('return', item)} title="Return Item">
                                <RotateCcw size={16} />
                            </button>
                        )}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#888' }}>No records found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ActionModal 
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        onConfirm={handleFinalConfirm}
        config={getModalConfig()}
      />
      
      <style>{`
        .action-btn-return { background: #fff; border: 1px solid #ddd; color: #1976D2; padding: 6px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .action-btn-return:hover { background: #E3F2FD; border-color: #1976D2; }

        .overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex; justify-content: center; align-items: center;
            z-index: 2000;
            backdrop-filter: blur(2px);
        }

        .modal-container { 
            background: white; 
            padding: 24px; 
            border-radius: 12px; 
            width: 90%;
            max-width: 400px;
            text-align: center; 
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            animation: popIn 0.2s ease-out;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .modal-header-icon {
            width: 50px; 
            height: 50px; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin-bottom: 16px;
            flex-shrink: 0;
            transition: all 0.2s;
        }

        .modal-title { 
            margin: 0 0 8px 0; 
            color: #111827;
            font-size: 18px; 
            font-weight: 600; 
        }
        
        .modal-desc { 
            color: #4B5563; 
            margin: 0 0 24px 0; 
            line-height: 1.5; 
            font-size: 14px; 
        }
        
        .modal-actions {
            width: 100%;
            display: flex;
            gap: 12px;
        }

        .btn-cancel {
            flex: 1;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #D1D5DB;
            background: white;
            color: #374151;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn-cancel:hover { background: #F3F4F6; }

        .btn-confirm { 
            flex: 1;
            padding: 10px; 
            border-radius: 6px; 
            border: none; 
            color: white; 
            font-weight: 500; 
            cursor: pointer;
            transition: background 0.2s;
        }
        
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default BorrowingPage;