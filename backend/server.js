require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt'); 

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS CONFIGURATION (Keep this one only!) ---
app.use(cors({
    origin: true,       // 'true' means allow any origin that asks
    credentials: true
}));

app.use(bodyParser.json());
// app.use(express.json()); // You can use this OR bodyParser, you don't need both. bodyParser is fine.

// --- DATABASE CONNECTION ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});




//        CONSTANTS & HELPERS
const ROLES = {
    SUPERADMIN: 1,
    ADMIN: 2,
    USER: 3
};

// Accepts targetUserID (Pass NULL for Admins/Global, Pass ID for specific User)
const createNotification = async (message, itemID = null, connection = null, targetUserID = null) => {
    try {
        const db = connection || pool; 
        await db.execute(
            'INSERT INTO notifications (itemID, message, isRead, createdAt, userID) VALUES (?, ?, 0, NOW(), ?)',
            [itemID, message, targetUserID]
        );
    } catch (error) {
        console.error("Notification System Error:", error);
    }
};

//               AUTH ROUTES

// 1. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.execute(
            'SELECT userID, fullName, email, password, roleID, status FROM users WHERE email = ?', 
            [email]
        );
        
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'User not found' });

        const user = rows[0];
        
        // COMPARE HASHED PASSWORD
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // --- CHECK FOR FIRST TIME LOGIN ---
            // If status is 'Inactive', force them to change password first.
            if (user.status === 'Inactive') {
                return res.json({ 
                    success: true, 
                    requirePasswordChange: true, 
                    userID: user.userID,
                    message: "First time login: Please update your password."
                });
            }
            // Normal Login Process (User is already Active)
            await pool.execute(
                "UPDATE users SET last_login = NOW() WHERE userID = ?", 
                [user.userID]
            );

            const userData = {
                id: user.userID,
                fullName: user.fullName, 
                email: user.email,
                roleId: user.roleID,
                status: user.status,
                photoUrl: null 
            };

            res.json({ success: true, user: userData });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 1b. COMPLETE FIRST LOGIN (New Route)
app.post('/api/auth/first-login', async (req, res) => {
    const { userID, newPassword } = req.body;

    if (!userID || !newPassword) {
        return res.status(400).json({ success: false, message: "Missing data" });
    }

    try {
        // 1. Hash the NEW password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 2. Activate User and Update Password
        await pool.execute(
            "UPDATE users SET password = ?, status = 'Active', last_login = NOW() WHERE userID = ?", 
            [hashedPassword, userID]
        );

        // 3. Get updated user details to log them in immediately
        const [rows] = await pool.execute('SELECT userID, fullName, email, roleID FROM users WHERE userID = ?', [userID]);
        const user = rows[0];

        // 4. Notify Admins
        await createNotification(`User Activated: ${user.fullName} has set their password and joined.`);

        const userData = {
            id: user.userID,
            fullName: user.fullName, 
            email: user.email,
            roleId: user.roleID,
            status: 'Active',
            photoUrl: null 
        };

        res.json({ success: true, message: "Password updated!", user: userData });

    } catch (error) {
        console.error("First Login Error:", error);
        res.status(500).json({ success: false, message: "Database error" });
    }
});

//             DASHBOARD ROUTES

// --- UPDATED DASHBOARD STATS ---
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // CHANGE: From SUM(quantity) to COUNT(*)
        // This counts how many rows (unique products) exist in your table
        const [itemsRes] = await pool.execute('SELECT COUNT(*) as total FROM items');
        
        const [borrowedRes] = await pool.execute(
            'SELECT COUNT(*) as count FROM borrowing WHERE dateReturned IS NULL'
        );

        res.json({
            totalItems: itemsRes[0].total || 0,
            borrowedItems: borrowedRes[0].count || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// 3. RECENT ACTIVITY (Updated for Role Filtering)
app.get('/api/dashboard/activity/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        // 1. Check the User's Role
        const [userRows] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const roleID = userRows[0].roleID;

        // 2. Build Query
        let sql = `
            SELECT l.actionType as title, l.details as description, l.actionDate as timestamp 
            FROM activity_log l 
        `;
        
        const params = [];

        // If USER (Role 3), restrict to their own ID. 
        // If Admin/Superadmin, they see everything (no WHERE clause needed).
        if (roleID == ROLES.USER) {
            sql += ` WHERE l.userID = ? `;
            params.push(userId);
        }

        sql += ` ORDER BY l.actionDate DESC LIMIT 5`;

        const [rows] = await pool.execute(sql, params);
        res.json(rows);

    } catch (error) {
        console.error("Activity Log Error:", error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// 4. LOW STOCK
app.get('/api/dashboard/low-stock', async (req, res) => {
    try {
        const sql = `
            SELECT i.itemName as name, i.quantity, t.typeName, i.threshold
            FROM items i
            JOIN types t ON i.typeID = t.typeID
            WHERE t.classification = 'Consumable' AND i.quantity <= COALESCE(i.threshold, 0)
        `;
        const [rows] = await pool.execute(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error checking low stock' });
    }
});

// 5. GET NOTIFICATIONS 
app.get('/api/notifications/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [u] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        if (u.length === 0) return res.json([]);
        const role = u[0].roleID;

        let sql = `
            SELECT notificationID as id, message as title, 'System Alert' as description, 'alert' as type, isRead, createdAt as timestamp 
            FROM notifications 
            WHERE `;
        
        if (role == ROLES.USER) {
            sql += `userID = ? `;
        } else {
            sql += `userID IS NULL `;
        }
        
        sql += `ORDER BY createdAt DESC LIMIT 10`;

        const [rows] = await pool.execute(sql, role == ROLES.USER ? [userId] : []);
        const formatted = rows.map(r => ({ ...r, isRead: !!r.isRead }));
        res.json(formatted);
    } catch (error) {
        console.error("Notif Error:", error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// 5b. MARK ALL READ 
app.put('/api/notifications/mark-all-read/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // 1. Get the user's role
        const [u] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        if (u.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        
        const role = u[0].roleID;

        // 2. Determine which notifications to mark read based on Role
        let sql;
        let params;

        if (role == ROLES.USER) {
            // Update only this specific user's notifications
            sql = 'UPDATE notifications SET isRead = 1 WHERE userID = ? AND isRead = 0';
            params = [userId];
        } else {
            // Update global admin notifications
            sql = 'UPDATE notifications SET isRead = 1 WHERE userID IS NULL AND isRead = 0';
            params = [];
        }
        const [result] = await pool.execute(sql, params);
        console.log(`Marked all read for User ${userId} (Role ${role}). Rows affected: ${result.affectedRows}`);
        res.json({ success: true, affected: result.affectedRows });

    } catch (error) {
        console.error("Mark All Read Error:", error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// 5c. GET ALL NOTIFICATIONS 
app.get('/api/notifications/all/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [u] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        if (u.length === 0) return res.json([]);
        const role = u[0].roleID;

        let sql = `
            SELECT notificationID as id, message as title, 'System Alert' as description, 'alert' as type, isRead, createdAt as timestamp 
            FROM notifications 
            WHERE `;
        
        if (role == ROLES.USER) {
            sql += `userID = ? `;
        } else {
            sql += `userID IS NULL `;
        }
        
        sql += `ORDER BY createdAt DESC`;

        const [rows] = await pool.execute(sql, role == ROLES.USER ? [userId] : []);
        const formatted = rows.map(r => ({ ...r, isRead: !!r.isRead }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// 5d. MARK SINGLE READ
app.put('/api/notifications/read/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('UPDATE notifications SET isRead = 1 WHERE notificationID = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Mark Read Error:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});


//           INVENTORY ROUTES (RBAC)


// 6. GET ALL ITEMS 
app.get('/api/inventory', async (req, res) => {
    try {
        const sql = `
            SELECT i.itemID as id, i.itemCode as code, i.itemName as name, c.committeeName as committee, i.committeeID, 
            t.typeName as type, t.classification, i.typeID, i.quantity as totalQty, u.unitName as unit, i.unitID, 
            i.location, i.threshold, 
            COALESCE(SUM(CASE 
                WHEN b.dateReturned IS NULL AND b.approvalStatus != 'Rejected' 
                THEN b.quantity ELSE 0 
            END), 0) as borrowedQty
            FROM items i
            LEFT JOIN committees c ON i.committeeID = c.committeeID
            LEFT JOIN types t ON i.typeID = t.typeID
            LEFT JOIN units u ON i.unitID = u.unitID
            LEFT JOIN borrowing b ON i.itemID = b.itemID
            GROUP BY i.itemID ORDER BY i.itemID ASC
        `;
        const [rows] = await pool.execute(sql);
        const inventory = rows.map(item => ({
            ...item,
            availableQty: Math.max(0, item.totalQty - item.borrowedQty) 
        }));
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// 7. GET DROPDOWN OPTIONS
app.get('/api/inventory/references', async (req, res) => {
    try {
        const [committees] = await pool.execute('SELECT committeeID as value, committeeName as label FROM committees');
        const [types] = await pool.execute('SELECT typeID as value, typeName as label FROM types');
        const [units] = await pool.execute('SELECT unitID as value, unitName as label FROM units');
        res.json({ committees, types, units });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch options' });
    }
});

// 8. ADD NEW ITEM 
app.post('/api/inventory', async (req, res) => {
    const { itemName, committeeID, typeID, quantity, unitID, location, roleID, userID } = req.body; 

    // 1. RBAC Check
    if (roleID == ROLES.USER) {
        return res.status(403).json({ success: false, message: 'Access Denied.' });
    }
    
    if (!itemName || !quantity) return res.status(400).json({ success: false, message: 'Missing required fields' });

    // 2. Data Preparation
    const qtyToAdd = parseInt(quantity, 10);
    const cleanItemName = itemName.trim();

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 3. User Validation
        let finalLoggerID = userID;
        
        if (!finalLoggerID) {
            const [adminCheck] = await connection.execute('SELECT userID FROM users WHERE roleID = 1 LIMIT 1');
            finalLoggerID = adminCheck.length > 0 ? adminCheck[0].userID : null;
        }

        // 4. CHECK FOR DUPLICATE (Case Insensitive)
        const [existingItems] = await connection.execute(
            'SELECT itemID, itemCode, quantity FROM items WHERE LOWER(itemName) = LOWER(?)',
            [cleanItemName]
        );

        if (existingItems.length > 0) {
            // --- SCENARIO A: UPDATE EXISTING ---
            const match = existingItems[0];
            const newTotal = match.quantity + qtyToAdd;

            await connection.execute('UPDATE items SET quantity = ? WHERE itemID = ?', [newTotal, match.itemID]);

            if (finalLoggerID) {
                await connection.execute(
                    `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('MODIFY', ?, NOW(), ?)`, 
                    [`Stock Added: ${qtyToAdd} to existing "${cleanItemName}" (${match.itemCode}). New Total: ${newTotal}`, finalLoggerID]
                );
            }

            await connection.execute(
                'INSERT INTO notifications (itemID, message, isRead, createdAt) VALUES (?, ?, 0, NOW())',
                [match.itemID, `Stock Added: ${qtyToAdd} units added to "${cleanItemName}".`]
            );

            await connection.commit();
            return res.json({ success: true, message: `Item "${cleanItemName}" exists. Qty updated to ${newTotal}.` });

        } else {
            // --- SCENARIO B: INSERT NEW ---
            let nextItemCode = 'ITM-0001';
            const [lastItem] = await connection.execute("SELECT itemCode FROM items WHERE itemCode LIKE 'ITM-%' ORDER BY itemID DESC LIMIT 1");
            
            if (lastItem.length > 0) {
                const parts = lastItem[0].itemCode.split('-');
                if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
                    nextItemCode = `ITM-${String(parseInt(parts[1]) + 1).padStart(4, '0')}`;
                }
            }

            const sql = `INSERT INTO items (itemCode, itemName, committeeID, typeID, quantity, unitID, location, threshold) VALUES (?, ?, ?, ?, ?, ?, ?, 5)`;
            const [result] = await connection.execute(sql, [nextItemCode, cleanItemName, committeeID, typeID, qtyToAdd, unitID, location]);
            
            if (finalLoggerID) {
                await connection.execute(
                    `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('ADD', ?, NOW(), ?)`, 
                    [`Added new item: ${cleanItemName} (${nextItemCode})`, finalLoggerID]
                );
            }

            await connection.execute(
                'INSERT INTO notifications (itemID, message, isRead, createdAt) VALUES (?, ?, 0, NOW())',
                [result.insertId, `New Item: ${cleanItemName} (${qtyToAdd} units) was added.`]
            );

            await connection.commit();
            res.json({ success: true, message: 'New item added successfully', code: nextItemCode });
        }

    } catch (error) {
        await connection.rollback();
        console.error("Add Item Database Error:", error); 
        res.status(500).json({ success: false, message: `Database Error: ${error.message}` });
    } finally {
        connection.release();
    }
});

// 9. DELETE ITEM (Restricted: Superadmin & Admin only)
app.delete('/api/inventory/:id', async (req, res) => {
    const { id } = req.params;
    const { roleID, userID } = req.body; 

    if (roleID == ROLES.USER) return res.status(403).json({ success: false, message: 'Access Denied.' });

    const loggerID = userID || 1;

    const connection = await pool.getConnection(); 

    try {
        await connection.beginTransaction();

        const [borrowCheck] = await connection.execute(
            'SELECT * FROM borrowing WHERE itemID = ? AND dateReturned IS NULL', 
            [id]
        );
        if (borrowCheck.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Cannot delete item currently being borrowed.' });
        }

        const [items] = await connection.execute('SELECT itemCode, itemName FROM items WHERE itemID = ?', [id]);
        if (items.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        const itemToDelete = items[0];

        await connection.execute('DELETE FROM notifications WHERE itemID = ?', [id]);
        await connection.execute('DELETE FROM items WHERE itemID = ?', [id]);

        await connection.execute(
            `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('REMOVE', ?, NOW(), ?)`, 
            [`Removed item: ${itemToDelete.itemName}`, loggerID]
        );

        await connection.execute(
            'INSERT INTO notifications (itemID, message, isRead, createdAt) VALUES (NULL, ?, 0, NOW())',
            [`Inventory Alert: Item "${itemToDelete.itemName}" was removed.`]
        );

        await connection.commit();
        res.json({ success: true, message: 'Item deleted' });

    } catch (error) {
        await connection.rollback();
        console.error("Delete Item Error:", error);
        res.status(500).json({ success: false, message: 'Failed to delete item (Database Error)' });
    } finally {
        connection.release();
    }
});

// 10. UPDATE ITEM (Restricted: Superadmin & Admin only)
app.put('/api/inventory/:id', async (req, res) => {
    const { id } = req.params;
    const { itemName, committeeID, typeID, quantity, unitID, location, roleID, userID } = req.body;

    if (roleID == ROLES.USER) return res.status(403).json({ success: false, message: 'Access Denied.' });

    const cleanItemName = itemName.trim();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let finalLoggerID = userID;
        const [userCheck] = await connection.execute('SELECT userID FROM users WHERE userID = ?', [userID || 0]);
        if (userCheck.length === 0) {
             const [adminCheck] = await connection.execute('SELECT userID FROM users WHERE roleID = 1 LIMIT 1');
             finalLoggerID = adminCheck.length > 0 ? adminCheck[0].userID : null;
        }

        const sql = `UPDATE items SET itemName = ?, committeeID = ?, typeID = ?, quantity = ?, unitID = ?, location = ? WHERE itemID = ?`;
        const [result] = await connection.execute(sql, [cleanItemName, committeeID, typeID, quantity, unitID, location, id]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (finalLoggerID) {
            await connection.execute(
                `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('MODIFY', ?, NOW(), ?)`, 
                [`Updated item: ${cleanItemName}`, finalLoggerID]
            );
        }

        await connection.execute(
             'INSERT INTO notifications (itemID, message, isRead, createdAt) VALUES (?, ?, 0, NOW())',
             [id, `Inventory Update: details for "${cleanItemName}" were modified.`]
        );

        await connection.commit();
        res.json({ success: true, message: 'Item updated successfully' });

    } catch (error) {
        await connection.rollback();
        console.error("Update Item Error:", error);
        res.status(500).json({ success: false, message: 'Database error' });
    } finally {
        connection.release();
    }
});
// --- DYNAMIC FILTER ROUTE ---
app.get('/api/inventory/types-list', async (req, res) => {
    try {
        // This gets the unique type names currently used or defined
        const [rows] = await pool.execute('SELECT typeName FROM types ORDER BY typeName ASC');
        const types = rows.map(r => r.typeName);
        res.json(types);
    } catch (error) {
        console.error("Filter Fetch Error:", error);
        res.status(500).json({ error: 'Failed to fetch type list' });
    }
});
//          BORROWING ROUTES (RBAC)

// 11. GET TRANSACTIONS
app.get('/api/borrowing', async (req, res) => {
    try {
        const sql = `
            SELECT 
                b.borrowingID as id, 
                i.itemCode as code, 
                i.itemName as name, 
                b.borrowerName as borrower,
                c.committeeName as committee, 
                b.quantity as qty, 
                DATE_FORMAT(b.dateBorrowed, '%b %d, %Y') as dateBorrowed,
                DATE_FORMAT(b.expectedReturn, '%b %d, %Y') as dateExpected,
                CASE 
                    WHEN b.dateReturned IS NOT NULL THEN DATE_FORMAT(b.dateReturned, '%b %d, %Y') 
                    ELSE '-' 
                END as dateReturned,
                b.approvalStatus, -- Send this to frontend
                CASE
                    WHEN b.approvalStatus = 'Pending' THEN 'Pending'
                    WHEN b.approvalStatus = 'Rejected' THEN 'Rejected'
                    WHEN b.dateReturned IS NOT NULL THEN 'Returned'
                    WHEN b.expectedReturn < CURDATE() AND b.dateReturned IS NULL THEN 'Overdue'
                    ELSE 'Borrowed'
                END as status
            FROM borrowing b
            JOIN items i ON b.itemID = i.itemID
            LEFT JOIN committees c ON b.committeeID = c.committeeID
            ORDER BY 
                CASE WHEN b.approvalStatus = 'Pending' THEN 0 ELSE 1 END, -- Pending on top
                b.dateBorrowed DESC
        `;
        const [rows] = await pool.execute(sql);
        res.json(rows);
    } catch (error) {
        console.error("Fetch Borrowing Error:", error);
        res.status(500).json({ error: 'Failed to fetch borrowing history' });
    }
});

// 12. CREATE TRANSACTION (Borrow Request)
app.post('/api/borrowing', async (req, res) => {
    const { itemID, borrowerName, committeeID, quantity, dateBorrowed, expectedReturn, userID, roleID } = req.body;

    const initialStatus = (roleID == ROLES.USER) ? 'Pending' : 'Approved';
    const activityAction = (roleID == ROLES.USER) ? 'REQUEST' : 'BORROW';

    if (!itemID || !borrowerName || !quantity) return res.status(400).json({ success: false, message: 'Missing fields' });

    const officerID = userID || 1; 
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [stockCheck] = await connection.execute(`
            SELECT i.quantity as total, i.itemName, 
            COALESCE(SUM(CASE WHEN b.dateReturned IS NULL AND b.approvalStatus != 'Rejected' THEN b.quantity ELSE 0 END), 0) as unavailableQty
            FROM items i LEFT JOIN borrowing b ON i.itemID = b.itemID 
            WHERE i.itemID = ? GROUP BY i.itemID
        `, [itemID]);

        if (stockCheck.length === 0) throw new Error('Item not found');
        const { total, unavailableQty, itemName } = stockCheck[0];
        const available = total - unavailableQty;

        if (quantity > available) throw new Error(`Only ${available} units available.`);

        const sql = `INSERT INTO borrowing (itemID, borrowerName, committeeID, quantity, dateBorrowed, expectedReturn, userID, approvalStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [resParams] = await connection.execute(sql, [itemID, borrowerName, committeeID, quantity, dateBorrowed, expectedReturn, officerID, initialStatus]);

        // LOG
        const logMsg = (initialStatus === 'Pending') ? `${borrowerName} requested ${quantity}x ${itemName}` : `${borrowerName} borrowed ${quantity}x ${itemName}`;
        await connection.execute(`INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES (?, ?, NOW(), ?)`, [activityAction, logMsg, officerID]);

        // NOTIFICATION LOGIC
        if (initialStatus === 'Pending') {
            // Case A: User Requests -> Notify Admins (Target: NULL)
            await createNotification(`Request: ${borrowerName} needs ${quantity}x ${itemName}. Review needed.`, itemID, connection, null);
        } else {
            // Case B: Admin Borrows -> Notify Admins (Target: NULL)
            await createNotification(`Borrowing: ${borrowerName} took ${quantity}x ${itemName}.`, itemID, connection, null);
        }

        await connection.commit();
        res.json({ success: true, message: initialStatus === 'Pending' ? 'Request submitted!' : 'Item borrowed.' });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// 12b. APPROVE REQUEST
app.put('/api/borrowing/approve/:id', async (req, res) => {
    const { id } = req.params;
    const { userID } = req.body; 

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Fetch details (Requester ID, Item Name, Quantity) BEFORE updating
        const [trans] = await connection.execute(`
            SELECT b.userID as requesterID, i.itemName, b.quantity 
            FROM borrowing b 
            JOIN items i ON b.itemID = i.itemID 
            WHERE b.borrowingID = ?
        `, [id]);

        if (trans.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const { requesterID, itemName, quantity } = trans[0];

        // 2. Update Status
        await connection.execute("UPDATE borrowing SET approvalStatus = 'Approved' WHERE borrowingID = ?", [id]);
        
        // 3. Log Activity with ITEM NAME
        await connection.execute(
            `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('APPROVE', ?, NOW(), ?)`, 
            [`Approved request for ${quantity}x ${itemName}`, userID || 1]
        );

        // 4. Send Notification
        await createNotification(
            `Your request for ${quantity}x ${itemName} has been APPROVED. You may pick it up.`, 
            null, 
            connection, 
            requesterID 
        );

        await connection.commit();
        res.json({ success: true, message: 'Request approved.' });
    } catch (error) {
        await connection.rollback();
        console.error("Approve Error:", error);
        res.status(500).json({ success: false, message: 'Database error' });
    } finally {
        connection.release();
    }
});

// 12c. REJECT REQUEST
app.put('/api/borrowing/reject/:id', async (req, res) => {
    const { id } = req.params;
    const { userID } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Fetch details (Requester ID, Item Name) BEFORE updating
        const [trans] = await connection.execute(`
            SELECT b.userID as requesterID, i.itemName, b.quantity
            FROM borrowing b 
            JOIN items i ON b.itemID = i.itemID 
            WHERE b.borrowingID = ?
        `, [id]);

        if (trans.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const { requesterID, itemName, quantity } = trans[0];

        // 2. Update Status
        await connection.execute("UPDATE borrowing SET approvalStatus = 'Rejected' WHERE borrowingID = ?", [id]);

        // 3. Log Activity with ITEM NAME
        await connection.execute(
            `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('REJECT', ?, NOW(), ?)`, 
            [`Rejected request for ${quantity}x ${itemName}`, userID || 1]
        );

        // 4. Send Notification
        await createNotification(
            `Your request for ${quantity}x ${itemName} was REJECTED.`, 
            null, 
            connection, 
            requesterID 
        );

        await connection.commit();
        res.json({ success: true, message: 'Request rejected.' });
    } catch (error) {
        await connection.rollback();
        console.error("Reject Error:", error);
        res.status(500).json({ success: false, message: 'Database error' });
    } finally {
        connection.release();
    }
});

// 13. RETURN ITEM (Restricted: Superadmin & Admin)
app.put('/api/borrowing/return/:id', async (req, res) => {
    const { id } = req.params; 
    const { userID, roleID } = req.body;

    if (roleID == ROLES.USER) return res.status(403).json({ success: false, message: 'Access Denied.' });

    const officerID = userID || 1;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const [trans] = await connection.execute(`
            SELECT b.borrowerName, i.itemName, b.quantity, b.itemID 
            FROM borrowing b JOIN items i ON b.itemID = i.itemID WHERE b.borrowingID = ?
        `, [id]);

        if (trans.length === 0) throw new Error('Transaction not found');
        const info = trans[0];

        await connection.execute('UPDATE borrowing SET dateReturned = CURDATE() WHERE borrowingID = ?', [id]);
        await connection.execute(
            `INSERT INTO activity_log (actionType, details, actionDate, userID) VALUES ('RETURN', ?, NOW(), ?)`, 
            [`${info.borrowerName} returned ${info.quantity}x ${info.itemName}`, officerID]
        );
        await createNotification(`Return Alert: ${info.borrowerName} returned ${info.quantity}x ${info.itemName}.`, info.itemID, connection);

        await connection.commit();
        res.json({ success: true, message: 'Item returned successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: 'Failed to return item' });
    } finally {
        connection.release();
    }
}); 

// 14. GET SYSTEM HISTORY (Updated for RBAC)
app.get('/api/history/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // 1. Check the User's Role in the Database
        const [u] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        if (u.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const role = u[0].roleID;

        // 2. Start building the query (Selects EVERYTHING by default)
        let sql = `
            SELECT l.logID as id, l.actionType as type, l.details, l.actionDate as date, u.fullName as user 
            FROM activity_log l 
            LEFT JOIN users u ON l.userID = u.userID 
        `;
        
        const params = [];

        // 3. THE LOGIC SWITCH:
        // If they are a USER (Role 3), add a WHERE clause to restrict data.
        if (role == ROLES.USER) {
            sql += ` WHERE l.userID = ? `;
            params.push(userId);
        }
        // If they are ADMIN (1 or 2), we SKIP the "WHERE" clause. 
        // This means Admins automatically see ALL rows.

        sql += ` ORDER BY l.actionDate DESC`;

        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (error) {
        console.error("History Error:", error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

//        SETTINGS: USER MANAGEMENT
// GET Users
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT userID as id, fullName as name, email, roleID, status, last_login as lastLogin FROM users`);
        const users = rows.map(u => ({
            ...u,
            role: u.roleID === 1 ? 'Superadmin' : (u.roleID === 2 ? 'Admin' : 'User'),
            lastLogin: u.lastLogin
        }));
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ADD User (Hashed Password & Role Logic)
app.post('/api/users', async (req, res) => {
    const { name, email, role, password, creatorRoleID } = req.body; 

    // Determine target role ID
    let targetRoleID = ROLES.USER; 
    if (role === 'Admin' || role === 'admin') targetRoleID = ROLES.ADMIN;
    if (role === 'Superadmin' || role === 'superadmin') targetRoleID = ROLES.SUPERADMIN;

    // RBAC: Only SUPERADMIN (1) can add users now
    if (creatorRoleID != ROLES.SUPERADMIN) {
        return res.status(403).json({ success: false, message: 'Access Denied. Only Superadmins can add users.' });
    }

    try {
        // HASH THE PASSWORD
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `INSERT INTO users (fullName, email, password, roleID, status, last_login) VALUES (?, ?, ?, ?, 'Inactive', NULL)`;
        await pool.execute(sql, [name, email, hashedPassword, targetRoleID]);

        await createNotification(`System Alert: New user "${name}" (${role}) has been added.`);
        res.json({ success: true, message: 'User added successfully' });
    } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// --- GET ALL USERS FIXED (unified naming) ---
app.get('/api/users', async (req, res) => {
    try {
        const [result] = await pool.execute(`
            SELECT 
                userID AS id,
                fullName AS name,
                email,
                roleID,
                status,
                lastLogin
            FROM users
        `);

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
});


// ---------------- BACKEND (DELETE USER FIXED) ------------------
app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;

    // Accept from body OR query
    const requestorRoleID =
        req.body.requestorRoleID ||
        req.query.role ||
        req.query.requestorRoleID;

    const role = Number(requestorRoleID);

    try {
        // 1) Fetch target user
        const [rows] = await pool.execute(
            "SELECT userID AS id, fullName, roleID, status FROM users WHERE userID = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const target = rows[0];

        // 2) RBAC checks: Only SUPERADMIN can remove users now
        if (role !== ROLES.SUPERADMIN) {
            return res.status(403).json({ success: false, message: "Access Denied. Only Superadmins can remove users." });
        }

        // 3) Prevent duplicate soft deletes
        if (target.status === "Removed") {
            return res.json({ success: true, message: "User already removed." });
        }

        // 4) SOFT DELETE instead of DELETE
        await pool.execute(
            "UPDATE users SET status = 'Removed' WHERE userID = ?",
            [id]
        );

        // 5) Send notification to admins
        await createNotification(`System Alert: User "${target.fullName}" was marked as Removed.`);

        return res.json({ success: true, message: "User removed (soft delete)." });

    } catch (err) {
        console.error("Soft Delete Error:", err);
        return res.status(500).json({ success: false, message: "Failed to remove user" });
    }
});


// ---------------------------------------------------------
//           SETTINGS: SYSTEM & THRESHOLDS (SECURED)
// ---------------------------------------------------------

// Helper: Updated to accept 'req' and check for Superadmin privileges
const handleDefinition = async (req, res, sql, params, successMsg) => {
    // 1. Get Role ID (from body for POST/PUT, or query string for DELETE)
    const requestorRole = req.body.roleID || req.query.roleID || req.query.requestorRoleID;

    // 2. Strict Check: Only Superadmin (ID 1) allowed
    if (requestorRole != ROLES.SUPERADMIN) {
        return res.status(403).json({ 
            success: false, 
            message: 'Access Denied. Only Superadmins can modify system settings.' 
        });
    }

    try {
        await pool.execute(sql, params);
        res.json({ success: true, message: successMsg });
    } catch (err) { 
        console.error("Settings DB Error:", err);
        
        // Handle foreign key constraint violations
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ success: false, message: 'Cannot delete: This option is currently being used by an active item.' });
        }
        
        res.status(500).json({ error: 'Database error' }); 
    }
};

// --- COMMITTEES ---
app.post('/api/settings/committees', (req, res) => {
    handleDefinition(req, res, 'INSERT INTO committees (committeeName) VALUES (?)', [req.body.name], 'Committee Added');
});

// FIX: Changed :name to :id and SQL to use committeeID
app.delete('/api/settings/committees/:id', (req, res) => {
    handleDefinition(req, res, 'DELETE FROM committees WHERE committeeID = ?', [req.params.id], 'Committee Deleted');
});

// --- UNITS ---
app.post('/api/settings/units', (req, res) => {
    handleDefinition(req, res, 'INSERT INTO units (unitName) VALUES (?)', [req.body.name], 'Unit Added');
});

// FIX: Changed :name to :id and SQL to use unitID
app.delete('/api/settings/units/:id', (req, res) => {
    handleDefinition(req, res, 'DELETE FROM units WHERE unitID = ?', [req.params.id], 'Unit Deleted');
});

// --- TYPES ---
app.post('/api/settings/types', (req, res) => {
    handleDefinition(req, res, 'INSERT INTO types (typeName) VALUES (?)', [req.body.name], 'Type Added');
});

// FIX: Changed :name to :id and SQL to use typeID
app.delete('/api/settings/types/:id', (req, res) => {
    handleDefinition(req, res, 'DELETE FROM types WHERE typeID = ?', [req.params.id], 'Type Deleted');
});

// --- THRESHOLD MANAGEMENT ---

// GET Threshold Items (Public/Shared is fine for viewing)
app.get('/api/inventory/items', async (req, res) => {
    try {
        const sql = `
            SELECT i.itemID as id, i.itemName as name, t.typeName as category, i.threshold 
            FROM items i 
            LEFT JOIN types t ON i.typeID = t.typeID 
            WHERE t.classification = 'Consumable' 
            ORDER BY i.itemName ASC
        `;
        const [rows] = await pool.execute(sql);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// UPDATE Threshold (Restricted to Superadmin)
app.put('/api/inventory/items/:id/threshold', async (req, res) => {
    const { id } = req.params;
    const { threshold, roleID } = req.body; // Frontend must send roleID

    if (roleID != ROLES.SUPERADMIN) {
        return res.status(403).json({ success: false, message: 'Access Denied. Only Superadmins can change thresholds.' });
    }

    try {
        await pool.execute('UPDATE items SET threshold = ? WHERE itemID = ?', [threshold, id]);
        res.json({ success: true, message: 'Threshold updated' });
    } catch (error) {
        console.error("Threshold Update Error:", error);
        res.status(500).json({ error: 'Failed to update threshold' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});