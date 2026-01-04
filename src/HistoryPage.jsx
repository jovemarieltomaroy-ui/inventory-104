import React, { useState, useEffect } from 'react';
import { FaSearch, FaFilter, FaCalendarAlt } from "react-icons/fa";
import { useNavigate } from 'react-router-dom';

const HistoryPage = () => {
  // --- 1. State ---
  const [transactions, setTransactions] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  const [filterType, setFilterType] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');
  const [startDate, setStartDate] = useState(null); 
  const [endDate, setEndDate] = useState(null);          
  const [searchTerm, setSearchTerm] = useState('');

  // User State
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  // --- 2. Load User on Mount ---
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
    } else {
        navigate('/'); // Redirect if not logged in
    }
  }, [navigate]);

  // --- 3. Data Fetching ---
  useEffect(() => {
    if (currentUser?.id) {
        fetchHistory();
    }
  }, [currentUser]);

  const fetchHistory = async () => {
    try {
      // We pass the ID here. The BACKEND decides if we see 'all' or 'ours'.
      const response = await fetch(`https://inventory-104.onrender.com/api/history/${currentUser.id}?_t=${Date.now()}`);
      const data = await response.json();
      
      const formattedData = transformData(data);
      setTransactions(formattedData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching history:", error);
      setLoading(false);
    }
  };

  // --- HELPER: Extracts Item Name from Log Details ---
  const transformData = (data) => {
    return data.map(item => {
      let derivedItem = "System Item";
      
      const details = item.details || "";

      // Case A: "Stock Added: 5 to item: Laptop (Code)"
      if (details.includes('item:')) {
        derivedItem = details.split('item:')[1].split('(')[0].trim();
      } 
      // Case B: Standard format with "x " separator
      else if (
          details.includes('borrowed') || 
          details.includes('returned') || 
          details.includes('requested') ||
          details.includes('Approved') ||
          details.includes('Rejected')   
      ) {
        const parts = details.split('x ');
        if (parts.length > 1) {
            derivedItem = parts[1].trim();
        } else {
            derivedItem = details;
        }
      } 
      // Case C: Fallback 
      else {
        derivedItem = details;
      }

      return {
        id: item.id,
        type: capitalizeFirstLetter(item.type), 
        item: derivedItem, 
        user: item.user || "Unknown User", 
        date: item.date, 
        rawDetails: details 
      };
    });
  };

  const capitalizeFirstLetter = (string) => {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  };

  // --- 4. Date Filter Logic ---
  const handleDateRangeChange = (e) => {
    const value = e.target.value;
    setDateFilter(value);

    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    let start = new Date(today);
    let end = new Date(); 

    switch (value) {
      case 'Today':
        break;
      case 'This Week':
        const day = today.getDay(); 
        start.setDate(today.getDate() - day); 
        break;
      case 'This Month':
        start.setDate(1);
        break;
      case 'This Sem':
        start.setMonth(today.getMonth() - 5);
        break;
      case 'All':
      default:
        setStartDate(null);
        setEndDate(null);
        return; 
    }
    end.setHours(23, 59, 59, 999);
    setStartDate(start);
    setEndDate(end);
  };

  // --- 5. Filter Implementation ---
  const filteredData = transactions.filter((t) => {
    const matchesType = filterType === 'All' || t.type.toUpperCase() === filterType.toUpperCase();
    
    let matchesDate = true;
    if (startDate && endDate) {
        const tDate = new Date(t.date);
        matchesDate = tDate >= startDate && tDate <= endDate;
    }
    
    const matchesSearch = 
        (t.item && t.item.toLowerCase().includes(searchTerm.toLowerCase())) || 
        (t.user && t.user.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.rawDetails && t.rawDetails.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesType && matchesDate && matchesSearch;
  });

  const getTypeBadgeClass = (type) => {
    const t = type.toUpperCase();
    switch (t) {
      case 'BORROW': return 'badge-borrow';
      case 'RETURN': return 'badge-return';
      case 'ADD': return 'badge-add';
      case 'MODIFY': return 'badge-modify';
      case 'REMOVE': return 'badge-remove';
      case 'REQUEST': return 'badge-request';
      case 'APPROVE': return 'badge-approve';
      case 'REJECT': return 'badge-reject';
      default: return 'badge-default';
    }
  };

  return (
    <div className="history-container">
      <div className="page-header"> 
        <div className="header-titles">
            <h1>Transaction History</h1>
            <p>View system activities</p>
        </div>
      </div>

      <div className="controls-bar">
        <div className="search-group">
          <FaSearch className="search-icon" />
          <input 
            type="text" 
            placeholder="Search item, user, or details..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filters-group">
          <div className="filter-item">
            <FaFilter className="filter-icon" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="All">All Types</option>
              <option value="Request">Request</option>
              <option value="Approve">Approve</option>
              <option value="Reject">Reject</option>
              <option value="Borrow">Borrow</option>
              <option value="Return">Return</option>
              <option value="Add">Add Stock</option>
              <option value="Modify">Modify</option>
              <option value="Remove">Remove</option>
            </select>
          </div>

          <div className="filter-item">
            <FaCalendarAlt className="filter-icon" />
            <select value={dateFilter} onChange={handleDateRangeChange}>
              <option value="All">All Time</option>
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
              <option value="This Sem">Last 5 Months</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction Type</th>
              <th>Item Name</th>
              <th>User / Admin</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
                <tr><td colSpan="5" style={{textAlign: "center", padding: "20px"}}>Loading history...</td></tr>
            ) : filteredData.length > 0 ? (
              filteredData.map((t) => (
                <tr key={t.id}>
                  <td className="col-date">{new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td>
                    <span className={`status-badge ${getTypeBadgeClass(t.type)}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="col-item">{t.item}</td>
                  <td className="col-user">{t.user}</td>
                  <td className="col-details">{t.rawDetails}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="no-data">
                    No transactions found 
                    {dateFilter !== 'All' && ` for ${dateFilter}`}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        /* Badge Styles */
        .status-badge {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            display: inline-block;
        }

        .badge-request {
            background-color: #FFF8E1; /* Light Orange */
            color: #F57C00; /* Dark Orange */
            border: 1px solid #FFE0B2;
        }

        .badge-approve {
            background-color: #E8F5E9; /* Light Green */
            color: #2E7D32; /* Dark Green */
            border: 1px solid #A5D6A7;
        }

        .badge-reject {
            background-color: #FFEBEE; /* Light Red */
            color: #C62828; /* Dark Red */
            border: 1px solid #EF9A9A;
        }

        .badge-borrow {
            background-color: #E3F2FD; /* Light Blue */
            color: #1565C0; /* Dark Blue */
            border: 1px solid #90CAF9;
        }

        .badge-return {
            background-color: #F3E5F5; /* Light Purple */
            color: #7B1FA2; /* Dark Purple */
            border: 1px solid #CE93D8;
        }

        .badge-add {
            background-color: #E0F2F1; /* Teal */
            color: #00695C;
            border: 1px solid #80CBC4;
        }

        .badge-modify {
            background-color: #FFF3E0; /* Orange/Yellow */
            color: #E65100;
            border: 1px solid #FFCC80;
        }

        .badge-remove {
            background-color: #FFEBEE;
            color: #C62828;
            border: 1px solid #EF9A9A;
        }

        .badge-default {
            background-color: #F5F5F5;
            color: #616161;
            border: 1px solid #E0E0E0;
        }
      `}</style>
    </div>
  );
};

export default HistoryPage;