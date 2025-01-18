const express = require('express');
const connection = require('./db');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;
const bcrypt = require('bcryptjs');

app.use(bodyParser.json());

// Configurazione CORS
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://chatrathassistant.vercel.app']
        : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));

// LOGIN 
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    connection.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        if (results.length > 0) {
            const user = results[0];
            // Confronta la password inserita con l'hash salvato
            if (bcrypt.compareSync(password, user.password)) {
                res.json({ 
                    message: 'Login effettuato con successo!', 
                    user: { id: user.id, name: user.name, role: user.role } 
                });
            } else {
                res.status(401).json({ message: 'Email o password errati' });
            }
        } else {
            res.status(401).json({ message: 'Email o password errati' });
        }
    });
});

// ASSISTANTS
app.post('/api/assistants', (req, res) => {
    const userId = req.body.userId; 

    const query = `
        SELECT *
        FROM assistants a
        JOIN canAccess ca ON a.id = ca.assistant_id
        WHERE ca.user_id = ?
    `;

    connection.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json(results); 
    });
});

// CHAT
app.post('/api/chat', (req, res) => {
    const { assistantToken, message, userId, threadId } = req.body;

    connection.query(
        'SELECT * FROM assistants WHERE token = ?',
        [assistantToken],
        async (err, assistantResults) => {
            if (err) {
                console.log('Errore query DB:', err);
                return res.status(500).json({ message: 'Errore interno del server' });
            }

            if (assistantResults.length === 0) {
                console.log('Assistente non trovato per il token:', assistantToken);
                return res.status(404).json({ message: 'Assistente non trovato' });
            }

            // Imposta l'URL di destinazione reale in base al token
            const apiUrl =
                assistantToken === 'asst_QCWfQJx5g25MNoNhHK1xN8oo'
                ? `https://fastapi-test-dxov.onrender.com/chat/asst_QCWfQJx5g25MNoNhHK1xN8oo`
                : `https://fastapi-test-dxov.onrender.com/chat/${assistantToken}`;
            console.log('API URL costruito:', apiUrl);

            try {
                // Crea una richiesta con il payload
                const chatPayload = {
                    user_id: userId.toString(),
                    prompt: message,
                    assistant_id: assistantToken,
                    thread_id: threadId
                };

                // Effettua una richiesta POST direttamente a FastAPI
                const finalResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(chatPayload)
                });

                if (!finalResponse.ok) {
                    const errorData = await finalResponse.json();
                    console.log('Errore dalla API:', errorData);
                    return res.status(finalResponse.status).json({ error: errorData.detail || 'Errore generico' });
                }

                const data = await finalResponse.json();
                return res.json({ response: data.response });
            } catch (error) {
                console.error('Errore durante la comunicazione con il proxy e FastAPI:', error);
                return res.status(500).json({ error: 'Errore di connessione al server dell\'assistente' });
            }
        }
    );
});

// ASSISTANT TOKEN
app.get('/api/assistant/:token', (req, res) => {
    const { token } = req.params;
    
    const query = 'SELECT id, name FROM assistants WHERE token = ?';
    
    connection.query(query, [token], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'Assistente non trovato' });
        }
        
        res.json({ 
            id: results[0].id,
            name: results[0].name
        });
    });
});

// METADATA
app.post('/api/metadata', (req, res) => {
    const { userId, assistantId, assistantName } = req.body;
    const now = new Date();
    const dataApertura = now.toISOString().slice(0, 19).replace('T', ' ');
    const threadId = uuidv4();

    const query = `
        INSERT INTO metadata 
        (user_id, assistant_id, data_apertura, nome_chatpage, thread_id) 
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(query, [userId, assistantId, dataApertura, assistantName, threadId], (err, results) => {
        if (err) {
            console.error('Errore inserimento metadata:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json({ 
            message: 'Metadata inseriti con successo',
            metadataId: results.insertId,
            threadId: threadId
        });
    });
});

// FEEDBACK
app.post('/api/feedback', (req, res) => {
    const { assistantId, userId, rating, comment, threadId } = req.body;

    // Validazione
    if (!assistantId || !userId || !rating || !threadId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Mancano dei campi obbligatori' 
        });
    }

    const now = new Date();
    const dataChiusura = now.toISOString().slice(0, 19).replace('T', ' ');

    const query = `
        UPDATE metadata 
        SET data_chiusura = ?,
            rating = ?,
            comment = ?
        WHERE thread_id = ? 
        AND user_id = ? 
        AND assistant_id = ?
    `;

    connection.query(
        query, 
        [dataChiusura, rating, comment || '', threadId, userId, assistantId],
        (err, results) => {
            if (err) {
                console.error('Errore durante l\'aggiornamento del feedback:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Errore durante il salvataggio del feedback'
                });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sessione di chat non trovata'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Feedback salvato con successo'
            });
        }
    );
});

// METADATA STATS
app.post('/api/metadata/stats', (req, res) => {
    const { assistantId, startDate, endDate } = req.body;

    const query = `
        SELECT 
            COUNT(*) AS total_conversations,
            AVG(TIMESTAMPDIFF(SECOND, data_apertura, data_chiusura)) AS average_duration,
            AVG(rating) AS average_rating,
            COUNT(comment) AS total_feedbacks
        FROM metadata
        WHERE assistant_id = ?
        AND data_apertura BETWEEN ? AND ?
    `;

    connection.query(query, [assistantId, startDate, endDate], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        const stats = results[0];

        const feedbackQuery = `
            SELECT comment, rating, data_chiusura
            FROM metadata
            WHERE assistant_id = ?
            AND data_apertura BETWEEN ? AND ?
            AND comment IS NOT NULL
            ORDER BY data_chiusura DESC
        `;

        connection.query(feedbackQuery, [assistantId, startDate, endDate], (err, feedbackResults) => {
            if (err) {
                console.error('Errore query feedback:', err);
                return res.status(500).json({ message: 'Errore interno del server' });
            }

            res.json({
                totalConversations: stats.total_conversations,
                averageDuration: stats.average_duration,
                averageRating: stats.average_rating,
                totalFeedbacks: stats.total_feedbacks,
                recentFeedbacks: feedbackResults
            });
        });
    });
});

// Endpoint di test
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Il server funziona correttamente!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.post('/api/assistants/admin', (req, res) => {
    const query = `
        SELECT *
        FROM assistants
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json(results); 
    });
});

// CAMBIO PASSWORD
app.post('/api/change-password', (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;

    // Verifica che tutti i campi siano presenti
    if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Tutti i campi sono obbligatori' });
    }

    // Verifica la password attuale
    connection.query(
        'SELECT * FROM user WHERE id = ?', [userId],
        (err, results) => {
            if (err) {
                console.error('Errore query:', err);
                return res.status(500).json({ message: 'Errore interno del server' });
            }

            if (results.length === 0 || !bcrypt.compareSync(currentPassword, results[0].password)) {
                return res.status(401).json({ message: 'Password attuale errata' });
            }

            // Hash della nuova password
            const hashedPassword = bcrypt.hashSync(newPassword, 10);

            // Aggiorna la password
            connection.query(
                'UPDATE user SET password = ? WHERE id = ?',
                [hashedPassword, userId],
                (err, updateResults) => {
                    if (err) {
                        console.error('Errore durante l\'aggiornamento della password:', err);
                        return res.status(500).json({ message: 'Errore durante l\'aggiornamento della password' });
                    }

                    res.status(200).json({ message: 'Password aggiornata con successo' });
                }
            );
        }
    );
});

// AGGIUNGI CLIENTE
app.post('/api/add-client', (req, res) => {
    const { name, email, password } = req.body;

    // Verifica che tutti i campi siano presenti
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Tutti i campi sono obbligatori' });
    }

    // Verifica se l'email esiste già
    connection.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: 'Email già esistente' });
        }

        // Hash della password
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Inserisci il nuovo cliente
        const query = 'INSERT INTO user (name, email, password, role) VALUES (?, ?, ?, ?)';
        connection.query(query, [name, email, hashedPassword, 'client'], (err, results) => {
            if (err) {
                console.error('Errore durante l\'inserimento del cliente:', err);
                return res.status(500).json({ message: 'Errore durante l\'inserimento del cliente' });
            }

            res.status(201).json({ message: 'Utente inserito con successo' });
        });
    });
});

// Gestione degli errori globale
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Si è verificato un errore interno del server' });
});

// Modifica l'export per Vercel
module.exports = app;

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
