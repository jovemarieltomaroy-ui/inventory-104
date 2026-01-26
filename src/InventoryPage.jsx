import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, Filter, AlertTriangle } from 'lucide-react';

// --- RBAC CONSTANTS ---
const ROLES = { SUPERADMIN: 1, ADMIN: 2, USER: 3 };

// --- INTERNAL COMPONENT: DELETE CONFIRMATION MODAL ---
const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, itemName }) => {
  if (!isOpen) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="delete-container" onClick={(e) => e.stopPropagation()}>
        <div className="delete-icon-box"><AlertTriangle size={32} /></div>
        <h3 className="delete-title">Delete Item?</h3>
        <p className="delete-desc">Are you sure you want to delete <strong>"{itemName}"</strong>?<br />This action cannot be undone.</p>
        <div className="delete-actions">
          <button className="btn-cancel-delete" onClick={onClose}>Cancel</button>
          <button className="btn-confirm-delete" onClick={onConfirm}>Delete</button>
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
  
  // Dynamic Option States
  const [committeeOptions, setCommitteeOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]); // NEW: State for dynamic Types

  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const user = JSON.parse(localStorage.getItem('user')) || {};
  const canManage = user.roleId === ROLES.SUPERADMIN || user.roleId === ROLES.ADMIN;

  // --- 2. FETCH DATA ---
  useEffect(() => {
    fetchItems();
    fetchReferences();
    fetchDynamicTypes(); // NEW: Fetch the dynamic types list
  }, [location.key]);
  
  const fetchReferences = async () => {
    try {
        const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory/references');
        if (response.ok) {
            const data = await response.json();
            setCommitteeOptions(data.committees); 
        }
    } catch (error) { console.error("Failed to fetch references:", error); }
  };

  // NEW: Fetch types from our new endpoint
  const fetchDynamicTypes = async () => {
    try {
        const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory/types-list');
        if (response.ok) {
            const data = await response.json();
            setTypeOptions(data);
        }
    } catch (error) { console.error("Failed to fetch types list:", error); }
  };

  const fetchItems = async () => {
    try {
        const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/inventory');
        if (response.ok) {
            const data = await response.json();
            setItems(data);
        }
    } catch (error) { console.error("Failed to fetch inventory:", error); } 
    finally { setLoading(false); }
  };

  // --- 3. FILTERING LOGIC ---
  const filteredItems = items.filter((item) => {
    const iName = item.name?.toLowerCase() || "";
    const iCode = item.code?.toLowerCase() || "";
    const iCommittee = item.committee || "Unknown";
    const iType = item.type || ""; // Match against the type name (e.g., "Bond Paper")

    const matchesSearch = 
      iName.includes(searchTerm.toLowerCase()) ||
      iCode.includes(searchTerm.toLowerCase()) ||
      iCommittee.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesCommittee = filterCommittee === "All" || iCommittee === filterCommittee;
    // MODIFIED: filterType now matches the item.type name
    const matchesType = filterType === "All" || iType === filterType;

    return matchesSearch && matchesCommittee && matchesType;
  });

  const handleDeleteClick = (item) => { setItemToDelete(item); setDeleteModalOpen(true); };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
        const payload = { roleID: user.roleId, userID: user.id };
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
        } else { alert(data.message || "Failed to delete item"); }
    } catch (error) { console.error("Error deleting item:", error); }
  };

  return (
    <div className="inventory-container">
      <div className="page-header">
        <div className="header-titles">
          <h1>Inventory</h1>
          <p>Manage and track all committee assets and supplies.</p>
        </div>
      </div>

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
            <select value={filterCommittee} onChange={(e) => setFilterCommittee(e.target.value)} className="filter-select">
              <option value="All">All Committees</option>
              {committeeOptions.map(c => <option key={c.value} value={c.label}>{c.label}</option>)}
            </select>
            <Filter size={14} className="select-icon" />
          </div>

          <div className="select-wrapper">
            {/* MODIFIED: Now maps over dynamic typeOptions */}
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
              <option value="All">All Types</option>
              {typeOptions.map((type, idx) => (
                <option key={idx} value={type}>{type}</option>
              ))}
            </select>
            <Filter size={14} className="select-icon" />
          </div>
        </div>

        {canManage && (
          <Link to="/dashboard/add-item" state={{ background: location }} className="add-btn" style={{ textDecoration: 'none' }}>
            <Plus size={18} /><span>Add Item</span>
          </Link>
        )}
      </div>

      <div className="table-card">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Code</th><th>Item Name</th><th>Committee</th><th>Type</th><th>Total</th><th>Borrowed</th><th>Available</th><th>Unit</th><th>Location</th>
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
                  <td><span className={`type-badge ${item.classification?.toLowerCase() || ''}`}>{item.type}</span></td>
                  <td style={{ fontWeight: '500' }}>{item.totalQty}</td>
                  <td style={{ color: '#E65100', fontWeight: item.borrowedQty > 0 ? 'bold' : 'normal' }}>{item.borrowedQty}</td>
                  <td style={{ color: '#2E7D32', fontWeight: 'bold' }}>{item.availableQty}</td>
                  <td>{item.unit}</td>
                  <td>{item.location}</td>
                  {canManage && (
                    <td className="actions-cell">
                        <Link to={`/dashboard/edit-item/${item.id}`} state={{ background: location, itemData: { ...item, quantity: item.totalQty } }} className="action-btn edit">
                            <Edit2 size={16} />
                        </Link>
                        <button className="action-btn delete" onClick={() => handleDeleteClick(item)}><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr><td colSpan={canManage ? "10" : "9"} style={{ textAlign: 'center', padding: '30px', color: '#888' }}>No items found matching your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <DeleteConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={confirmDelete} itemName={itemToDelete?.name || "Item"} />
    </div>
  );
};

export default InventoryPage;