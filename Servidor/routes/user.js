const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

const router = express.Router();


function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (error) {
        return res.status(403).json({ success: false, error: 'Token inválido o expirado' });
    }
}


router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
    
        const [existingUser] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, error: 'El correo electrónico ya está registrado' });
        }

   
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO Users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

      
        const token = jwt.sign(
            { userId: result.insertId }, 
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        console.log(token);
        res.status(201).json({
            success: true,
            data: {
                message: 'Usuario registrado exitosamente',
                userId: result.insertId,
                token 
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al registrar el usuario', details: error.message });
    }
});



router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }

        const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, data: { message: 'Login exitoso', token } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
    }
});


router.get('/user', authenticateToken, async (req, res) => {
    try {
        const [user] = await db.query('SELECT username, email FROM Users WHERE user_id = ?', [req.user.userId]);
        if (user.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        res.json({ success: true, data: { username: user[0].username, email: user[0].email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener los datos del usuario' });
    }
});


router.put('/user', authenticateToken, async (req, res) => {
    const { username, email } = req.body;
    if (!username || !email) {
        return res.status(400).json({ success: false, error: 'Nombre y correo son obligatorios' });
    }

    try {
        const [existingUser] = await db.query(
            'SELECT * FROM Users WHERE email = ? AND user_id != ?',
            [email, req.user.userId]
        );
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, error: 'El correo electrónico ya está registrado por otro usuario' });
        }

        await db.query(
            'UPDATE Users SET username = ?, email = ? WHERE user_id = ?',
            [username, email, req.user.userId]
        );

        res.json({ success: true, data: { message: 'Datos actualizados correctamente' } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al actualizar los datos del usuario' });
    }
});


router.get('/userprogress', authenticateToken, async (req, res) => {
    try {
        const [progress] = await db.query(
            'SELECT current_level, badges_earned, wpm, last_updated FROM userprogress WHERE user_id = ?',
            [req.user.userId]
        );

        if (progress.length === 0) {
            return res.status(404).json({ success: false, error: 'Progreso no encontrado' });
        }

        res.json({ 
            success: true, 
            data: {
                currentLevel: progress[0].current_level,
                badgesEarned: progress[0].badges_earned,
                wpm: progress[0].wpm,
                lastUpdated: progress[0].last_updated
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error al obtener el progreso del usuario' });
    }
});



router.post('/userprogress', authenticateToken, async (req, res) => {
    console.log("Solicitud POST recibida");
    console.log(req.body); 
    const { currentLevel, badgesEarned, wpm } = req.body;

    if (currentLevel=== null || badgesEarned=== null || wpm===null) {
        console.log("Faltan campos en la solicitud");
        return res.status(400).json({ success: false, error: 'Todos los campos (currentLevel, badgesEarned, wpm) son obligatorios' });
    }

    try {
       
        const [existingProgress] = await db.query(
            'SELECT * FROM userprogress WHERE user_id = ?',
            [req.user.userId]
        );

        if (existingProgress.length === 0) {
           
            await db.query(
                'INSERT INTO userprogress (user_id, current_level, badges_earned, wpm, last_updated) VALUES (?, ?, ?, ?, NOW())',
                [req.user.userId, currentLevel, badgesEarned, wpm]
            );
            console.log("Progreso creado exitosamente");
            return res.status(201).json({ success: true, data: { message: 'Progreso creado exitosamente' } });
        }

     
        await db.query(
            'UPDATE userprogress SET current_level = ?, badges_earned = ?, wpm = ?, last_updated = NOW() WHERE user_id = ?',
            [currentLevel, badgesEarned, wpm, req.user.userId]
        );

        console.log("Progreso actualizado correctamente");
        return res.json({ success: true, data: { message: 'Progreso actualizado correctamente' } });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: 'Error al actualizar el progreso del usuario' });
    }
});



module.exports = router;
