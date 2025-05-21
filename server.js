const express = require('express');
const connection = require('./db');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

// ── Anthropic SDK ────────────────────────────────────────────────
const { Anthropic } = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// ────────────────────────────────────────────────────────────────

app.use(bodyParser.json());

// Configurazione CORS
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://www.threshold.coach', 'https://chatrathassistant.vercel.app', 'threshold.coach']
        : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));

// test
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Il server funziona correttamente!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ────────────────────────────────────────────────────────────────
// NUOVO ENDPOINT ANTHROPIC
// Body richiesto:
// {
//   "messages": [{ "role": "user", "content": "ciao" }, ...],
//   "system": "you are a test chatbot",     // facoltativo
//   "model": "claude-3-haiku-20240307",     // facoltativo
//   "temperature": 0.2,                     // facoltativo
//   "max_tokens": 1024                      // facoltativo
// }
app.post('/api/anthropic', async (req, res) => {
    const {
        messages,
        system = '',
        model = 'claude-3-haiku-20240307',
        temperature = 0.2,
        max_tokens = 1024
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: 'messages array mancante o vuoto' });
    }

    try {
        const response = await anthropic.messages.create({
            model,
            system,
            messages,
            temperature,
            max_tokens
        });
        res.json({ assistant: response.content[0].text });
    } catch (err) {
        console.error('Anthropic API error:', err);
        const status = err?.statusCode || 500;
        res.status(status).json({ error: err.message || 'Errore Anthropic' });
    }
});
// ────────────────────────────────────────────────────────────────

// LOGIN 
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    connection.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        if (results.length > 0) {
            const user = results[0];
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
        ORDER BY 
            CASE 
                WHEN a.group = 'tailored' THEN 0
                ELSE 1
            END,
            a.group,
            a.id
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

            const apiUrl =
                assistantToken === 'asst_QCWfQJx5g25MNoNhHK1xN8oo'
                ? `https://fastapi-test-jkm9.onrender.com/chat/asst_QCWfQJx5g25MNoNhHK1xN8oo`
                : `https://fastapi-test-jkm9.onrender.com/chat/${assistantToken}`;

            try {
                const chatPayload = {
                    user_id: userId.toString(),
                    prompt: message,
                    assistant_id: assistantToken,
                    thread_id: threadId
                };

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
    
    const query = 'SELECT id, name, first_message, prompt FROM assistants WHERE token = ?';
    
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
            name: results[0].name,
            first_message: results[0].first_message,
            prompt: results[0].prompt
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
    const { assistantId, userId, rating, comment, threadId, isAnthropic } = req.body;

    // Per Anthropic, verifichiamo se c'è un feedback da salvare
    if (isAnthropic) {
        // Se non c'è un feedback (rating default e commento vuoto), rispondiamo con successo
        if (rating === 3 && (!comment || comment.trim() === '')) {
            return res.status(200).json({
                success: true,
                message: 'Nessun feedback da salvare'
            });
        }

        // Se c'è un feedback, lo salviamo in una nuova riga
        const now = new Date();
        const dataChiusura = now.toISOString().slice(0, 19).replace('T', ' ');

        const query = `
            INSERT INTO metadata 
            (user_id, assistant_id, data_apertura, data_chiusura, nome_chatpage, thread_id, rating, comment) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        connection.query(
            query,
            [userId, assistantId, dataChiusura, dataChiusura, 'Anthropic Chat', null, rating, comment || ''],
            (err, results) => {
                if (err) {
                    console.error('Errore durante il salvataggio del feedback Anthropic:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Errore durante il salvataggio del feedback'
                    });
                }

                res.status(200).json({
                    success: true,
                    message: 'Feedback salvato con successo'
                });
            }
        );
        return;
    }

    // Per il servizio Default, manteniamo la logica esistente
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
    const { assistantId, startDate, endDate, userId } = req.body;

    let query = `
        SELECT 
            COUNT(*) AS total_conversations,
            AVG(TIMESTAMPDIFF(SECOND, data_apertura, data_chiusura)) AS average_duration,
            AVG(rating) AS average_rating,
            COUNT(comment) AS total_feedbacks
        FROM metadata
        WHERE 1=1
    `;

    const queryParams = [];

    if (assistantId) {
        query += ' AND assistant_id = ?';
        queryParams.push(assistantId);
    }

    if (startDate && endDate) {
        query += ' AND data_apertura BETWEEN ? AND (? + INTERVAL 1 DAY)';
        queryParams.push(startDate, endDate);
    }

    if (userId) {
        query += ' AND user_id = ?';
        queryParams.push(userId);
    }

    console.log(query);
    console.log(queryParams);

    connection.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        const stats = results[0];

        let feedbackQuery = `
            SELECT *, a.name AS assistant_name
            FROM metadata m
            JOIN assistants a ON m.assistant_id = a.id
        `;

        if (assistantId) {
            feedbackQuery += ' AND m.assistant_id = ?';
        }

        if (startDate && endDate) {
            feedbackQuery += ' AND data_apertura BETWEEN ? AND (? + INTERVAL 1 DAY)';
        }

        if (userId) {
            feedbackQuery += ' AND user_id = ?';
        }

        console.log(feedbackQuery);
        console.log(queryParams);

        connection.query(feedbackQuery, queryParams, (err, feedbackResults) => {
            if (err) {
                console.error('Errore query feedback:', err);
                return res.status(500).json({ message: 'Errore interno del server' });
            }

            console.log('Feedback Results:', feedbackResults);

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

// ENDPOINT PER STATISTICHE GLOBALI
app.get('/api/admin/stats', (req, res) => {
    const totalClientsQuery = "SELECT COUNT(*) AS totalClients FROM user WHERE role = 'client'";
    const totalAssistantsQuery = "SELECT COUNT(*) AS totalAssistants FROM assistants";
    const totalConversationsQuery = "SELECT COUNT(*) AS totalConversations FROM metadata";
    const totalFeedbacksQuery = "SELECT COUNT(*) AS totalFeedbacks FROM metadata WHERE comment IS NOT NULL";

    connection.query(totalClientsQuery, (err, clientsResults) => {
        if (err) {
            console.error('Errore query totalClients:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        connection.query(totalAssistantsQuery, (err, assistantsResults) => {
            if (err) {
                console.error('Errore query totalAssistants:', err);
                return res.status(500).json({ message: 'Errore interno del server' });
            }

            connection.query(totalConversationsQuery, (err, conversationsResults) => {
                if (err) {
                    console.error('Errore query totalConversations:', err);
                    return res.status(500).json({ message: 'Errore interno del server' });
                }

                connection.query(totalFeedbacksQuery, (err, feedbacksResults) => {
                    if (err) {
                        console.error('Errore query totalFeedbacks:', err);
                        return res.status(500).json({ message: 'Errore interno del server' });
                    }

                    res.json({
                        totalClients: clientsResults[0].totalClients,
                        totalAssistants: assistantsResults[0].totalAssistants,
                        totalConversations: conversationsResults[0].totalConversations,
                        totalFeedbacks: feedbacksResults[0].totalFeedbacks
                    });
                });
            });
        });
    });
});

// Endpoint di test (duplicato voluto, come nel codice originale)
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

    if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Tutti i campi sono obbligatori' });
    }

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

            const hashedPassword = bcrypt.hashSync(newPassword, 10);

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

// RIMUOVI CLIENTE
app.post('/api/remove-client', (req, res) => {
    const { email } = req.body;
    
    connection.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Errore durante la verifica dell\'email:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Email not found' });
        }

        connection.query('DELETE FROM user WHERE email = ?', [email], (err, results) => {
            if (err) {
                console.error('Errore durante la rimozione del cliente:', err);
                return res.status(500).json({ message: 'Errore durante la rimozione del cliente' });
            }

            res.status(200).json({ message: 'Client removed successfully' });
        });
    });
});

// AGGIUNGI CLIENTE
app.post('/api/add-client', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Tutti i campi sono obbligatori' });
    }

    connection.query('SELECT * FROM user WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: 'Email already exists' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const query = 'INSERT INTO user (name, email, password, role) VALUES (?, ?, ?, ?)';
        connection.query(query, [name, email, hashedPassword, 'client'], (err, results) => {
            if (err) {
                console.error('Errore durante l\'inserimento del cliente:', err);
                return res.status(500).json({ message: 'Errore durante l\'inserimento del cliente' });
            }

            const userId = results.insertId;

            const assistantQuery = "SELECT id FROM assistants WHERE type = 'default'";
            connection.query(assistantQuery, (err, assistantResults) => {
                if (err) {
                    console.error('Errore query assistenti:', err);
                    return res.status(500).json({ message: 'Errore durante il recupero degli assistenti' });
                }

                const canAccessQuery = 'INSERT INTO canAccess (user_id, assistant_id) VALUES ?';
                const canAccessValues = assistantResults.map(assistant => [userId, assistant.id]);

                connection.query(canAccessQuery, [canAccessValues], (err) => {
                    if (err) {
                        console.error('Errore durante l\'inserimento in canAccess:', err);
                        return res.status(500).json({ message: 'Errore durante l\'inserimento delle autorizzazioni' });
                    }

                    res.status(201).json({ message: 'Utente inserito con successo e autorizzazioni aggiornate' });
                });
            });
        });
    });
});

// Endpoint per ottenere tutti gli utenti con ruolo 'client'
app.get('/api/users', (req, res) => {
    const query = "SELECT id FROM user WHERE role = 'client'";

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Errore query utenti:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        res.json(results);
    });
});

// CHECK METADATA
app.post('/api/metadata/check', (req, res) => {
    const { userId, assistantId } = req.body;

    const query = `
        SELECT thread_id 
        FROM metadata 
        WHERE user_id = ? 
        AND assistant_id = ? 
        AND data_chiusura IS NULL 
        AND thread_id IS NOT NULL
        ORDER BY data_apertura DESC 
        LIMIT 1
    `;

    connection.query(query, [userId, assistantId], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        if (results.length > 0) {
            res.json({ 
                exists: true, 
                threadId: results[0].thread_id 
            });
        } else {
            res.json({ 
                exists: false 
            });
        }
    });
});

// CREATE METADATA
app.post('/api/metadata', (req, res) => {
    const { userId, assistantId, assistantName, isAnthropic } = req.body;
    const now = new Date();
    const dataApertura = now.toISOString().slice(0, 19).replace('T', ' ');
    const threadId = isAnthropic ? null : uuidv4();

    const query = `
        INSERT INTO metadata 
        (user_id, assistant_id, data_apertura, nome_chatpage, thread_id) 
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(query, [userId, assistantId, dataApertura, assistantName, threadId], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        res.json({ 
            threadId: threadId,
            message: 'Metadata creati con successo'
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

// Funzione per gestire la riconnessione al database
function handleDisconnect() {
    connection.connect((err) => {
        if (err) {
            console.error('Errore durante la riconnessione al database:', err);
            setTimeout(handleDisconnect, 2000); // Riprova dopo 2 secondi
        } else {
            console.log('Riconnesso al database');
        }
    });
}

// Funzione per inviare una query di polling al database
function startDatabasePolling() {
    setInterval(() => {
        connection.query('SELECT COUNT(*) AS totalAssistants FROM assistants', (err, results) => {
            if (err) {
                console.error('Errore durante il polling del database:', err);
                connection.end();
                connection = require('./db');
                handleDisconnect();
            } else {
                console.log('POLLING - Numero totale di assistenti:', results[0].totalAssistants);
            }
        });
    }, 1800000); // 30 minuti
}

// Avvia la connessione e il polling del database
startDatabasePolling();