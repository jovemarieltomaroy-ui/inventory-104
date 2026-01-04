import { Routes, Route, useLocation } from "react-router-dom";
import './App.css';

// Import Pages
import Dashboard from './Dashboard';
import InventoryPage from './InventoryPage';
import BorrowingPage from './BorrowingPage';
import HistoryPage from './HistoryPage';
import SettingsPage from './SettingsPage';
import LoginPage from './LoginPage'; 
import AddItem from './AddItem';
import EditItem from './EditItem';
import BorrowItem from './BorrowItem';
import Notifications from "./Notifications";

function App() {
  const location = useLocation();
  const background = location.state && location.state.background;

 return (
    <>
      <Routes location={background || location}>
        {/* 1. Make Login Page the Root Route */}
        <Route path="/" element={<LoginPage />} />

        {/* 2. Move Dashboard to its own path */}
        <Route path="/dashboard" element={<Dashboard />}>
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="borrowing" element={<BorrowingPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="add-item" element={<AddItem />} />
          <Route path="edit-item/:id" element={<EditItem />} />
          <Route path="borrow-item" element={<BorrowItem />} />
        </Route>
      </Routes>

      {/* 3. Modal Routes to match new path structure */}
      {background && (
        <Routes>
          <Route path="/dashboard/add-item" element={<AddItem />} />
          <Route path="/dashboard/edit-item/:id" element={<EditItem />} />
          <Route path="/dashboard/borrow-item" element={<BorrowItem />} />
        </Routes>
      )}
    </>
  );
}

export default App;