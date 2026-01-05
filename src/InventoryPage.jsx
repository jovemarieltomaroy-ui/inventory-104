import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, Filter, AlertTriangle } from 'lucide-react';

// --- RBAC CONSTANTS ---
const ROLES = {
  SUPERADMIN: 1,
  ADMIN: 2,
  USER: 3
};

// --- INTERNAL COMPONENT: DELETE CONFIRMATION MODAL ---
const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, itemName }) => {
  if (!isOpen) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="delete-container" onClick={(e) => e.stopPropagation()}>
        <div className="delete-icon-box">
          <AlertTriangle size={32} strokeWidth={2} />
        </div>
        
        <h3 className="delete-title">Delete Item?</h3>
        
        <p className="delete-desc">
          Are you sure you want to delete <strong>"{itemName}"</strong>? 
          <br />
          This action cannot be undone.
        </p>

        <div className="delete-actions">
          <button className="btn-cancel-delete" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const InventoryPage = () => {
  const location = useLocation();

  // --- 1. STATES ---
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCommittee, setFilterCommittee] = useState("All");
  const [filterType, setFilterType] = useState("All");

  // State for Delete Modal
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [committeeOptions, setCommitteeOptions] = useState([]);

  // --- USER DATA FOR RBAC ---
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const canManage = user.roleId === ROLES.SUPERADMIN || user.roleId === ROLES.ADMIN;

  // --- 2. FETCH DATA ---
  useEffect(() => {
    fetchItems();
    fetchReferences();
  }, [location.key]);
  
  const fetchReferences = async () => {
    try {
        const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory/references');
        if (response.ok) {
            const data = await response.json();
            setCommitteeOptions(data.committees); 
        }
    } catch (error) {
        console.error("Failed to fetch references:", error);
    }
  };

  const fetchItems = async () => {
    try {
        const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory');
        if (response.ok) {
            const data = await response.json();
            setItems(data);
        }
    } catch (error) {
        console.error("Failed to fetch inventory:", error);
    } finally {
        setLoading(false);
    }
  };

 // --- 3. FILTERING LOGIC ---
  const filteredItems = items.filter((item) => {
    const iName = item.name ? item.name.toLowerCase() : "";
    const iCode = item.code ? item.code.toLowerCase() : "";
    const iCommittee = item.committee ? item.committee : "Unknown";
    const iClassification = item.classification ? item.classification : "";

    const matchesSearch = 
      iName.includes(searchTerm.toLowerCase()) ||
      iCode.includes(searchTerm.toLowerCase()) ||
      iCommittee.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesCommittee = filterCommittee === "All" || iCommittee === filterCommittee;
    const matchesType = filterType === "All" || iClassification === filterType;

    return matchesSearch && matchesCommittee && matchesType;
  });

  // --- 4. DELETE HANDLERS ---
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
        //  Pass BOTH roleID AND userID for backend log/verification
        const payload = { 
            roleID: user.roleId,
            userID: user.id 
        };

        const res = await fetch(`https://inventory-backend-yfyn.onrender.com/api/inventory/${itemToDelete.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload) 
        });
        const data = await res.json();

        if (data.success) {
            setItems(items.filter(item => item.id !== itemToDelete.id));
            setDeleteModalOpen(false);
            setItemToDelete(null);
        } else {
            alert(data.message || "Failed to delete item");
        }
    } catch (error) {
        console.error("Error deleting item:", error);
    }
  };

  return (
    <div className="inventory-container">
      
      {/* --- PAGE HEADER --- */}
      <div className="page-header">
        <div className="header-titles">
          <h1>Inventory</h1>
          <p>Manage and track all committee assets and supplies.</p>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="controls-card">
        <div className="filters-group">
          <div className="search-wrapper">
            <Search className="search-icon" size={20} />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="select-wrapper">
            <select 
              value={filterCommittee} 
              onChange={(e) => setFilterCommittee(e.target.value)}
              className="filter-select"
            >
              <option value="All">All Committees</option>
              {committeeOptions.map(c => (
              <option key={c.value} value={c.label}>{c.label}</option>))}
            </select>
            <Filter size={14} className="select-icon" />
          </div>
          <div className="select-wrapper">
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="All">All Types</option>
              <option value="Asset">Assets</option>
              <option value="Consumable">Consumables</option>
            </select>
            <Filter size={14} className="select-icon" />
          </div>
        </div>

        {/* RBAC: Only show Add button if user is NOT a Role 3 (User) */}
        {canManage && (
          <Link 
            to="/dashboard/add-item" 
            state={{ background: location }} 
            className="add-btn"
            style={{ textDecoration: 'none' }}
          >
            <Plus size={18} />
            <span>Add Item</span>
          </Link>
        )}
      </div>

      {/* --- TABLE --- */}
      <div className="table-card">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Item Name</th>
              <th>Committee</th>
              <th>Type</th>
              <th>Total</th>
              <th>Borrowed</th>
              <th>Available</th>
              <th>Unit</th>
              <th>Location</th>
              {/* Only show Actions column header if user can manage */}
              {canManage && <th className="actions-cell">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
                <tr><td colSpan={canManage ? "10" : "9"} style={{textAlign:'center', padding:'20px'}}>Loading Inventory...</td></tr>
            ) : filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="code-cell">{item.code}</td>
                  <td className="name-cell">{item.name}</td>
                  <td>{item.committee}</td>
                  <td>
                    <span className={`type-badge ${item.type ? item.type.toLowerCase() : ''}`}>
                      {item.type}
                    </span>
                  </td>
                  
                  <td style={{ fontWeight: '500' }}>{item.totalQty}</td>
                  <td style={{ color: '#E65100', fontWeight: item.borrowedQty > 0 ? 'bold' : 'normal' }}>
                    {item.borrowedQty}
                  </td>
                  <td style={{ color: '#2E7D32', fontWeight: 'bold' }}>
                    {item.availableQty}
                  </td>

                  <td>{item.unit}</td>
                  <td>{item.location}</td>
                  
                  {/* RBAC: Only show Action Buttons if user can manage */}
                  {canManage && (
                    <td className="actions-cell">
                        <Link 
                            to={`/dashboard/edit-item/${item.id}`}
                            state={{ 
                            background: location, 
                            itemData: { ...item, quantity: item.totalQty } 
                            }}
                            className="action-btn edit"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Edit2 size={16} />
                        </Link>

                        <button 
                            className="action-btn delete"
                            onClick={() => handleDeleteClick(item)}
                        >
                            <Trash2 size={16} />
                        </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canManage ? "10" : "9"} style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                  No items found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- DELETE CONFIRMATION POP-UP --- */}
      <DeleteConfirmationModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        itemName={itemToDelete?.name || "Item"}
      />

    </div>
  );
};

export default InventoryPage;