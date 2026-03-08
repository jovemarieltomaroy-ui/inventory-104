require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors({
    origin: true, 
    credentials: true
}));
app.use(bodyParser.json());

// --- DATABASE CONNECTION ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const ROLES = {
    SUPERADMIN: 1,
    ADMIN: 2,
    USER: 3
};

// --- HELPERS ---
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

// --- AUTH ROUTES ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.execute(
            'SELECT userID, fullName, email, password, roleID, status FROM users WHERE email = ? AND status != "Removed"',
            [email]
        );

        if (rows.length === 0) return res.status(401).json({ success: false, message: 'User not found' });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            if (user.status === 'Inactive') {
                return res.json({
                    success: true,
                    requirePasswordChange: true,
                    userID: user.userID,
                    message: "First time login: Please update your password."
                });
            }
            await pool.execute("UPDATE users SET last_login = NOW() WHERE userID = ?", [user.userID]);

            res.json({
                success: true,
                user: {
                    id: user.userID,
                    fullName: user.fullName,
                    email: user.email,
                    roleId: user.roleID,
                    status: user.status
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/auth/first-login', async (req, res) => {
    const { userID, newPassword } = req.body;
    if (!userID || !newPassword) return res.status(400).json({ success: false, message: "Missing data" });

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.execute(
            "UPDATE users SET password = ?, status = 'Active', last_login = NOW() WHERE userID = ?",
            [hashedPassword, userID]
        );

        const [rows] = await pool.execute('SELECT userID, fullName, email, roleID FROM users WHERE userID = ?', [userID]);
        const user = rows[0];

        await createNotification(`User Activated: ${user.fullName} has joined the system.`);

        res.json({
            success: true,
            user: { id: user.userID, fullName: user.fullName, email: user.email, roleId: user.roleID, status: 'Active' }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database error" });
    }
});

// --- DASHBOARD & NOTIFICATIONS ---

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const [[items]] = await pool.execute('SELECT COUNT(*) as total FROM items');
        const [[borrowed]] = await pool.execute('SELECT COUNT(*) as count FROM borrowing WHERE dateReturned IS NULL AND approvalStatus = "Approved"');
        res.json({ totalItems: items.total || 0, borrowedItems: borrowed.count || 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

app.get('/api/notifications/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [[u]] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        if (!u) return res.json([]);

        let sql = `SELECT notificationID as id, message as title, createdAt as timestamp, isRead 
                   FROM notifications WHERE `;
        sql += (u.roleID == ROLES.USER) ? `userID = ? ` : `userID IS NULL `;
        sql += `ORDER BY createdAt DESC LIMIT 15`;

        const [rows] = await pool.execute(sql, u.roleID == ROLES.USER ? [userId] : []);
        res.json(rows.map(r => ({ ...r, isRead: !!r.isRead })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.put('/api/notifications/mark-all-read/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [[u]] = await pool.execute('SELECT roleID FROM users WHERE userID = ?', [userId]);
        let sql = (u.roleID == ROLES.USER) 
            ? 'UPDATE notifications SET isRead = 1 WHERE userID = ? AND isRead = 0'
            : 'UPDATE notifications SET isRead = 1 WHERE userID IS NULL AND isRead = 0';
        
        const [result] = await pool.execute(sql, u.roleID == ROLES.USER ? [userId] : []);
        res.json({ success: true, affected: result.affectedRows });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// --- INVENTORY ROUTES ---

app.get('/api/inventory', async (req, res) => {
    try {
        const sql = `
            SELECT i.itemID as id, i.itemCode as code, i.itemName as name, c.committeeName as committee, 
            t.typeName as type, t.classification, i.quantity as totalQty, u.unitName as unit, 
            i.location, i.threshold,
            COALESCE(SUM(CASE WHEN b.dateReturned IS NULL AND b.approvalStatus = 'Approved' THEN b.quantity ELSE 0 END), 0) as borrowedQty
            FROM items i
            LEFT JOIN committees c ON i.committeeID = c.committeeID
            LEFT JOIN types t ON i.typeID = t.typeID
            LEFT JOIN units u ON i.unitID = u.unitID
            LEFT JOIN borrowing b ON i.itemID = b.itemID
            GROUP BY i.itemID ORDER BY i.itemCode ASC`;
        const [rows] = await pool.execute(sql);
        res.json(rows.map(item => ({ ...item, availableQty: Math.max(0, item.totalQty - item.borrowedQty) })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

app.post('/api/inventory', async (req, res) => {
    const { itemName, committeeID, typeID, quantity, unitID, location, roleID, userID } = req.body;
    if (roleID == ROLES.USER) return res.status(403).json({ success: false, message: 'Denied' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [existing] = await conn.execute('SELECT itemID, quantity FROM items WHERE LOWER(itemName) = LOWER(?)', [itemName.trim()]);

        if (existing.length > 0) {
            const newQty = existing[0].quantity + parseInt(quantity);
            await conn.execute('UPDATE items SET quantity = ? WHERE itemID = ?', [newQty, existing[0].itemID]);
            await createNotification(`Stock Update: ${itemName} increased to ${newQty}`, existing[0].itemID, conn);
        } else {
            const [[last]] = await conn.execute("SELECT itemCode FROM items ORDER BY itemID DESC LIMIT 1");
            let nextCode = 'ITM-0001';
            if (last) {
                const num = parseInt(last.itemCode.split('-')[1]) + 1;
                nextCode = `ITM-${String(num).padStart(4, '0')}`;
            }
            await conn.execute(
                `INSERT INTO items (itemCode, itemName, committeeID, typeID, quantity, unitID, location, threshold) VALUES (?, ?, ?, ?, ?, ?, ?, 5)`,
                [nextCode, itemName.trim(), committeeID, typeID, quantity, unitID, location]
            );
        }
        await conn.commit();
        res.json({ success: true, message: 'Inventory updated' });
    } catch (e) {
        await conn.rollback();
        res.status(500).json({ success: false, message: e.message });
    } finally { conn.release(); }
});

// --- BORROWING LOGIC ---

app.post('/api/borrowing', async (req, res) => {
    const { itemID, borrowerName, committeeID, quantity, dateBorrowed, expectedReturn, userID, roleID } = req.body;
    const isPending = (roleID == ROLES.USER);
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        // Stock Check Logic...
        const sql = `INSERT INTO borrowing (itemID, borrowerName, committeeID, quantity, dateBorrowed, expectedReturn, userID, approvalStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        await conn.execute(sql, [itemID, borrowerName, committeeID, quantity, dateBorrowed, expectedReturn, userID, isPending ? 'Pending' : 'Approved']);
        
        await createNotification(
            isPending ? `New Request from ${borrowerName}` : `Item issued to ${borrowerName}`,
            itemID, conn, null
        );

        await conn.commit();
        res.json({ success: true, message: 'Success' });
    } catch (e) {
        await conn.rollback();
        res.status(400).json({ success: false, message: e.message });
    } finally { conn.release(); }
});

// --- USER MANAGEMENT (RBAC) ---

app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT userID as id, fullName as name, email, roleID, status, last_login as lastLogin 
            FROM users WHERE status != 'Removed'`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const role = Number(req.body.requestorRoleID || req.query.roleID);

    if (role !== ROLES.SUPERADMIN) return res.status(403).json({ success: false, message: "Only Superadmins can remove users." });

    try {
        await pool.execute("UPDATE users SET status = 'Removed' WHERE userID = ?", [id]);
        res.json({ success: true, message: "User soft-deleted." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error" });
    }
});

// --- SYSTEM SETTINGS HELPER ---
const handleDefinition = async (req, res, sql, params, successMsg) => {
    const role = req.body.roleID || req.query.roleID;
    if (role != ROLES.SUPERADMIN) return res.status(403).json({ success: false, message: 'Superadmin only' });

    try {
        await pool.execute(sql, params);
        res.json({ success: true, message: successMsg });
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ success: false, message: 'Option is in use' });
        res.status(500).json({ error: 'Database error' });
    }
};

app.post('/api/settings/committees', (req, res) => handleDefinition(req, res, 'INSERT INTO committees (committeeName) VALUES (?)', [req.body.name], 'Added'));
app.delete('/api/settings/committees/:id', (req, res) => handleDefinition(req, res, 'DELETE FROM committees WHERE committeeID = ?', [req.params.id], 'Deleted'));

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));