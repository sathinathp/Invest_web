require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const dns = require('dns');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3005;

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Storage config for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        let prefix = 'file-';
        if (file.fieldname === 'pitchAudio') {
            prefix = 'pitch-';
        } else if (file.fieldname === 'coverImage') {
            prefix = 'blog-img-';
        } else if (file.fieldname === 'blogVideo') {
            prefix = 'blog-vid-';
        }
        cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Increase to 50MB limit to support video uploads
});

// Middleware
app.use((req, res, next) => {
    const host = req.get('host');
    if (host && host.includes('onrender.com')) {
        return res.redirect(301, `https://lamniscate.com${req.originalUrl}`);
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== ADMIN AUTHENTICATION =====
// In-memory session store: token -> expiry timestamp
const adminSessions = new Map();
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

// Validate admin session token (used by API routes that need protection)
function requireAdminAuth(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.admin_token;
    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const expiry = adminSessions.get(token);
    if (Date.now() > expiry) {
        adminSessions.delete(token);
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    next();
}

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'lemniscate2026';

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = crypto.randomBytes(32).toString('hex');
        adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL);
        console.log(`[ADMIN] Login successful for user: ${username}`);
        return res.json({ success: true, token, expiresIn: ADMIN_SESSION_TTL });
    }
    console.warn(`[ADMIN] Failed login attempt for user: ${username}`);
    return res.status(401).json({ error: 'Invalid username or password.' });
});

// POST /api/admin/logout
app.post('/api/admin/logout', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (token) adminSessions.delete(token);
    res.json({ success: true });
});

// GET /api/admin/verify — client calls this on page load to check if token is still valid
app.get('/api/admin/verify', (req, res) => {
    const token = req.headers['x-admin-token'] || req.query.admin_token;
    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ valid: false });
    }
    const expiry = adminSessions.get(token);
    if (Date.now() > expiry) {
        adminSessions.delete(token);
        return res.status(401).json({ valid: false });
    }
    return res.json({ valid: true });
});

app.use(express.static(path.join(__dirname, 'public')));

// Path to JSON DB
const PITCHES_FILE = path.join(__dirname, 'pitches.json');

// Helper to read pitches
const readPitches = () => {
    if (!fs.existsSync(PITCHES_FILE)) {
        return [];
    }
    try {
        const data = fs.readFileSync(PITCHES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading pitches file:', error);
        return [];
    }
};

// Helper to write pitches
const writePitches = (pitches) => {
    try {
        fs.writeFileSync(PITCHES_FILE, JSON.stringify(pitches, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing pitches file:', error);
        return false;
    }
};

// Seed portfolio companies (for portfolio search on the site)
const SECTOR_KEYWORDS = {
    'AI / ML': ['ai', 'ml', 'nlp', 'neural', 'learning', 'gpt', 'llm', 'deep learning', 'vision', 'agent'],
    'SaaS': ['saas', 'software', 'cloud', 'b2b', 'platform', 'api', 'subscription'],
    'Fintech': ['fintech', 'finance', 'payment', 'bank', 'lending', 'crypto', 'ledger', 'pay', 'transaction', 'treasury'],
    'Developer Tools': ['devtools', 'developer', 'tool', 'git', 'coding', 'api', 'compiler', 'debugging', 'ide', 'sdk'],
    'Deep Tech': ['deep tech', 'hardware', 'robotics', 'quantum', 'space', 'chip', 'semiconductor', 'biotech', 'photonics'],
    'Climate Tech': ['climate', 'carbon', 'solar', 'battery', 'green', 'energy', 'offset', 'emission', 'circular'],
    'Enterprise': ['enterprise', 'b2b', 'corporate', 'workflow', 'security', 'compliance', 'database'],
    'Consumer Internet': ['consumer', 'marketplace', 'app', 'social', 'creator', 'ecommerce', 'retail']
};

// Analyze pitch text and generate scores + simulated transcription feedback
function analyzePitch(pitch) {
    const textToAnalyze = `${pitch.problem} ${pitch.whyNow} ${pitch.speechText || ''}`.toLowerCase();
    
    // 1. Sector Alignment
    let matchedSector = 'Other';
    let maxMatches = 0;
    
    Object.keys(SECTOR_KEYWORDS).forEach(sector => {
        let matches = 0;
        SECTOR_KEYWORDS[sector].forEach(keyword => {
            if (textToAnalyze.includes(keyword)) matches++;
        });
        
        // Boost if they selected this sector in the dropdown
        if (pitch.sector === sector) matches += 3;
        
        if (matches > maxMatches) {
            maxMatches = matches;
            matchedSector = sector;
        }
    });

    // 2. Score Qualities (0-100)
    // base scores
    let obsession = 70 + Math.floor(Math.random() * 20);
    let speed = 70 + Math.floor(Math.random() * 20);
    let resilience = 70 + Math.floor(Math.random() * 20);
    let techDepth = 65 + Math.floor(Math.random() * 25);
    let marketIntuition = 65 + Math.floor(Math.random() * 25);

    // Boost scores based on text analysis
    if (textToAnalyze.includes('obsess') || textToAnalyze.includes('passion') || textToAnalyze.includes('love') || textToAnalyze.includes('24/7')) {
        obsession = Math.min(100, obsession + 8);
    }
    if (textToAnalyze.includes('fast') || textToAnalyze.includes('speed') || textToAnalyze.includes('quick') || textToAnalyze.includes('ship') || textToAnalyze.includes('days')) {
        speed = Math.min(100, speed + 8);
    }
    if (textToAnalyze.includes('fail') || textToAnalyze.includes('bounce') || textToAnalyze.includes('hard') || textToAnalyze.includes('survive') || textToAnalyze.includes('years')) {
        resilience = Math.min(100, resilience + 8);
    }
    if (textToAnalyze.includes('phd') || textToAnalyze.includes('stanford') || textToAnalyze.includes('mit') || textToAnalyze.includes('engineer') || textToAnalyze.includes('architecture') || textToAnalyze.includes('code')) {
        techDepth = Math.min(100, techDepth + 10);
    }
    if (textToAnalyze.includes('market') || textToAnalyze.includes('customer') || textToAnalyze.includes('tam') || textToAnalyze.includes('sam') || textToAnalyze.includes('billion') || textToAnalyze.includes('niche')) {
        marketIntuition = Math.min(100, marketIntuition + 8);
    }

    const overallScore = Math.round((obsession + speed + resilience + techDepth + marketIntuition) / 5);

    // Generate feedback comments from Sanjay Kumar
    let comment = '';
    if (overallScore >= 85) {
        comment = `Incredible pitch. ${pitch.founderName} shows a rare blend of deep technical chops and execution velocity. The obsession with solving this problem in ${pitch.sector} stands out immediately. Let's schedule an intro call immediately.`;
    } else if (overallScore >= 75) {
        comment = `Solid presentation. Strong founder qualities, particularly in ${obsession > resilience ? 'Obsession' : 'Resilience'}. I want to drill deeper into the technical moat and how they plan to compete in the ${pitch.sector} market. Put on review list.`;
    } else {
        comment = `Interesting space. ${pitch.startupName} addresses a real pain point, but the execution roadmap looks a bit standard. Let's monitor their shipping speed over the next month before deciding on a first check.`;
    }

    return {
        scores: {
            obsession,
            speed,
            resilience,
            techDepth,
            marketIntuition,
            overall: overallScore
        },
        matchedSector,
        sanjayFeedback: comment
    };
}

// API Routes

// 1. Submit Pitch
app.post('/api/pitch', upload.single('pitchAudio'), async (req, res) => {
    try {
        const {
            founderName,
            founderEmail,
            startupName,
            website,
            linkedin,
            sector,
            stage,
            raised,
            problem,
            whyNow,
            speechText
        } = req.body;

        if (!founderName || !founderEmail || !startupName || !sector || !stage || !problem || !whyNow) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const audioFile = req.file ? `/uploads/${req.file.filename}` : null;
        
        // Generate simulated transcription if audio uploaded but speechText is missing
        let finalSpeechText = speechText || '';
        if (audioFile && !finalSpeechText) {
            finalSpeechText = `[Simulated Audio Pitch Transcription]: Hello, my name is ${founderName} from ${startupName}. We are building in the ${sector} sector. Our product solves the following problem: ${problem}. We believe now is the perfect time because: ${whyNow}. We hope to partner with Lemniscate Investments.`;
        }

        const pitchData = {
            id: 'pitch_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            founderName,
            founderEmail,
            startupName,
            website: website || '',
            linkedin: linkedin || '',
            sector,
            stage,
            raised: raised || '$0',
            problem,
            whyNow,
            speechText: finalSpeechText,
            audioFile,
            status: 'New', // New, Reviewing, Contacted, Funded, Passed
            createdAt: new Date().toISOString(),
            sanjayNotes: ''
        };

        // Analyze pitch
        const analysis = analyzePitch(pitchData);
        pitchData.analysis = analysis.scores;
        pitchData.sanjayFeedback = analysis.sanjayFeedback;
        pitchData.matchedSector = analysis.matchedSector;

        // Save
        const pitches = readPitches();
        pitches.push(pitchData);
        writePitches(pitches);

        // Nodemailer configuration for pitch
        const smtpHostEnv = process.env.SMTP_HOST || 'smtp.mailtrap.io';
        let smtpHost = smtpHostEnv;
        if (smtpHostEnv && !/^[0-9.]+$/.test(smtpHostEnv)) {
            try {
                const lookupRes = await dns.promises.lookup(smtpHostEnv, { family: 4 });
                if (lookupRes && lookupRes.address) {
                    smtpHost = lookupRes.address;
                    console.log(`[SMTP] Resolved ${smtpHostEnv} to IPv4: ${smtpHost}`);
                }
            } catch (dnsErr) {
                console.warn(`[SMTP] DNS lookup for ${smtpHostEnv} failed, using hostname:`, dnsErr);
            }
        }

        const smtpPort = parseInt(process.env.SMTP_PORT || '2525', 10);
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            },
            tls: {
                servername: smtpHostEnv
            },
            connectionTimeout: 10000, // 10 seconds timeout
            greetingTimeout: 10000,
            socketTimeout: 10000
        });

        const fromEmail = process.env.SMTP_USER || 'info@lemniscate.com';
        const toEmail = process.env.NOTIFICATION_EMAIL || 'info@lemniscate.com';

        const mailOptions = {
            from: `"${founderName} (via website)" <${fromEmail}>`,
            to: toEmail,
            replyTo: founderEmail,
            subject: `New Pitch Submission: ${startupName} (${founderName})`,
            text: `Founder Name: ${founderName}\n` +
                  `Founder Email: ${founderEmail}\n` +
                  `Startup Name: ${startupName}\n` +
                  `Website: ${website || 'N/A'}\n` +
                  `LinkedIn: ${linkedin || 'N/A'}\n` +
                  `Sector: ${sector}\n` +
                  `Stage: ${stage}\n` +
                  `Raised: ${raised || '$0'}\n` +
                  `Audio File Path: ${audioFile || 'None'}\n\n` +
                  `Problem:\n${problem}\n\n` +
                  `Why Now:\n${whyNow}\n\n` +
                  `Speech Text/Transcription:\n${finalSpeechText}\n\n` +
                  `AI Analysis:\n` +
                  `- Overall Score: ${analysis.scores.overall}\n` +
                  `- Obsession: ${analysis.scores.obsession}\n` +
                  `- Speed: ${analysis.scores.speed}\n` +
                  `- Resilience: ${analysis.scores.resilience}\n` +
                  `- Technical Depth: ${analysis.scores.techDepth}\n` +
                  `- Market Intuition: ${analysis.scores.marketIntuition}\n\n` +
                  `Partner Feedback:\n${analysis.sanjayFeedback}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #b89765; border-bottom: 2px solid #b89765; padding-bottom: 8px; margin-top: 0;">New Startup Pitch Submission</h2>
                    
                    <h3 style="color: #4a5568; margin-top: 20px; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">Founder & Company Details</h3>
                    <p><strong>Founder Name:</strong> ${founderName}</p>
                    <p><strong>Email Address:</strong> ${founderEmail}</p>
                    <p><strong>Startup Name:</strong> ${startupName}</p>
                    <p><strong>Website:</strong> ${website ? `<a href="${website}" target="_blank">${website}</a>` : 'N/A'}</p>
                    <p><strong>LinkedIn:</strong> ${linkedin ? `<a href="${linkedin}" target="_blank">${linkedin}</a>` : 'N/A'}</p>
                    <p><strong>Sector:</strong> ${sector}</p>
                    <p><strong>Stage:</strong> ${stage}</p>
                    <p><strong>Capital Raised:</strong> ${raised || '$0'}</p>
                    <p><strong>Audio File Path:</strong> ${audioFile ? `<a href="${audioFile}" target="_blank">${audioFile}</a>` : 'None'}</p>
                    
                    <h3 style="color: #4a5568; margin-top: 20px; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">The Pitch</h3>
                    <p><strong>The Problem:</strong></p>
                    <div style="background-color: #f7fafc; padding: 12px 16px; margin: 8px 0; border-radius: 4px;">${problem.replace(/\n/g, '<br>')}</div>
                    
                    <p><strong>Why Now:</strong></p>
                    <div style="background-color: #f7fafc; padding: 12px 16px; margin: 8px 0; border-radius: 4px;">${whyNow.replace(/\n/g, '<br>')}</div>
                    
                    <p><strong>Speech Text / Audio Transcription:</strong></p>
                    <div style="background-color: #f7fafc; padding: 12px 16px; margin: 8px 0; border-radius: 4px; font-style: italic;">${finalSpeechText.replace(/\n/g, '<br>')}</div>

                    <h3 style="color: #4a5568; margin-top: 20px; border-bottom: 1px solid #edf2f7; padding-bottom: 4px;">AI Assessment & Feedback</h3>
                    <p><strong>Overall Score:</strong> <span style="font-size: 1.15rem; font-weight: 700; color: #b89765;">${analysis.scores.overall}/100</span></p>
                    <ul style="margin: 8px 0; padding-left: 20px;">
                        <li>Obsession: ${analysis.scores.obsession}/100</li>
                        <li>Speed: ${analysis.scores.speed}/100</li>
                        <li>Resilience: ${analysis.scores.resilience}/100</li>
                        <li>Technical Depth: ${analysis.scores.techDepth}/100</li>
                        <li>Market Intuition: ${analysis.scores.marketIntuition}/100</li>
                    </ul>
                    <p><strong>Partner Evaluation (Sanjay Kumar):</strong></p>
                    <div style="background-color: #f7fafc; border-left: 4px solid #b89765; padding: 12px 16px; margin: 8px 0; font-style: italic;">
                        ${analysis.sanjayFeedback}
                    </div>

                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                    <p style="font-size: 0.8rem; color: #718096; text-align: center;">Sent automatically from Lemniscate Investments Terminal</p>
                </div>
            `
        };

        // Send mail asynchronously so it doesn't block the client response
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter.sendMail(mailOptions)
                .then(() => {
                    console.log(`Pitch email successfully sent to ${toEmail} for ${startupName}`);
                })
                .catch((mailError) => {
                    console.error('Failed to send pitch email via SMTP:', mailError);
                });
        } else {
            console.log('SMTP credentials not configured. Pitch submission saved to pitches.json and logged below:');
            console.log(mailOptions);
        }

        res.status(201).json({
            success: true,
            message: 'Pitch submitted successfully!',
            pitchId: pitchData.id,
            analysis: pitchData.analysis,
            sanjayFeedback: pitchData.sanjayFeedback,
            recipient: toEmail
        });
    } catch (error) {
        console.error('Error handling pitch submission:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Get All Pitches (for Admin Dashboard)
app.get('/api/pitches', (req, res) => {
    try {
        const pitches = readPitches();
        // Sort newest first
        pitches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(pitches);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve pitches' });
    }
});

// 3. Get Single Pitch
app.get('/api/pitches/:id', (req, res) => {
    try {
        const pitches = readPitches();
        const pitch = pitches.find(p => p.id === req.params.id);
        if (!pitch) {
            return res.status(404).json({ error: 'Pitch not found' });
        }
        res.json(pitch);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve pitch' });
    }
});

// 4. Update Pitch Status/Notes
app.post('/api/pitches/:id/status', (req, res) => {
    try {
        const { status, sanjayNotes } = req.body;
        const pitches = readPitches();
        const index = pitches.findIndex(p => p.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Pitch not found' });
        }

        if (status) pitches[index].status = status;
        if (sanjayNotes !== undefined) pitches[index].sanjayNotes = sanjayNotes;

        writePitches(pitches);
        res.json({ success: true, pitch: pitches[index] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update pitch status' });
    }
});

// 5. Delete Pitch
app.delete('/api/pitches/:id', (req, res) => {
    try {
        const pitches = readPitches();
        const filtered = pitches.filter(p => p.id !== req.params.id);
        
        if (pitches.length === filtered.length) {
            return res.status(404).json({ error: 'Pitch not found' });
        }

        writePitches(filtered);
        res.json({ success: true, message: 'Pitch deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete pitch' });
    }
});

// 6. Submit Contact Inquiry (goes to info@lamniscate.com)
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        if (!name || !email || !phone || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Save locally to database
        const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
        let contacts = [];
        if (fs.existsSync(CONTACTS_FILE)) {
            try {
                contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
            } catch (e) {
                console.error(e);
            }
        }
        contacts.push({
            id: 'contact_' + Date.now(),
            name,
            email,
            phone,
            message,
            createdAt: new Date().toISOString()
        });
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8');

        // Nodemailer configuration
        const smtpHostEnv = process.env.SMTP_HOST || 'smtp.mailtrap.io';
        let smtpHost = smtpHostEnv;
        if (smtpHostEnv && !/^[0-9.]+$/.test(smtpHostEnv)) {
            try {
                const lookupRes = await dns.promises.lookup(smtpHostEnv, { family: 4 });
                if (lookupRes && lookupRes.address) {
                    smtpHost = lookupRes.address;
                    console.log(`[SMTP] Resolved ${smtpHostEnv} to IPv4: ${smtpHost}`);
                }
            } catch (dnsErr) {
                console.warn(`[SMTP] DNS lookup for ${smtpHostEnv} failed, using hostname:`, dnsErr);
            }
        }

        const smtpPort = parseInt(process.env.SMTP_PORT || '2525', 10);
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            },
            tls: {
                servername: smtpHostEnv
            },
            connectionTimeout: 10000, // 10 seconds timeout
            greetingTimeout: 10000,
            socketTimeout: 10000
        });

        const fromEmail = process.env.SMTP_USER || 'info@lemniscate.com';
        const toEmail = process.env.NOTIFICATION_EMAIL || 'info@lemniscate.com';

        const mailOptions = {
            from: `"${name} (via website)" <${fromEmail}>`,
            to: toEmail,
            replyTo: email,
            subject: `New Contact Submission from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #b89765; border-bottom: 2px solid #b89765; padding-bottom: 8px; margin-top: 0;">New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone:</strong> ${phone}</p>
                    <p><strong>Message:</strong></p>
                    <div style="background-color: #f7fafc; border-left: 4px solid #b89765; padding: 12px 16px; margin: 16px 0; font-style: italic;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                    <p style="font-size: 0.8rem; color: #718096; text-align: center;">Sent automatically from Lemniscate Investments Terminal</p>
                </div>
            `
        };

        // Send mail asynchronously so it doesn't block the client response
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter.sendMail(mailOptions)
                .then(() => {
                    console.log(`Email successfully sent to ${toEmail} from ${email}`);
                })
                .catch((mailError) => {
                    console.error('Failed to send email via SMTP:', mailError);
                });
        } else {
            console.log('SMTP credentials not configured. Contact submission saved to contacts.json and logged below:');
            console.log(mailOptions);
        }

        res.status(200).json({ success: true, message: 'Message submitted successfully!', recipient: toEmail });
    } catch (error) {
        console.error('Error handling contact form submission:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== BLOG INSIGHTS DATABASE & ENDPOINTS =====
const BLOGS_FILE = path.join(__dirname, 'blogs.json');

const writeBlogs = (blogs) => {
    try {
        fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogs, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing blogs file:', error);
        return false;
    }
};

const readBlogs = () => {
    if (!fs.existsSync(BLOGS_FILE)) {
        // Seed default blogs to match blogs.html original content
        const defaultBlogs = [
            {
                id: 1,
                category: "venture",
                categoryLabel: "Venture Capital",
                title: "Reimagining Pre-Seed Check Sizes: Our Combined $1M Venture Strategy",
                desc: "How Lemniscate manages risk and partners with high-potential founders by putting $1 million to work across our cornerstone portfolio investments: PetaBytz Technologies, Bluebix Solutions, and SoftStandard Solutions.",
                date: "June 28, 2026",
                readTime: "6 min read",
                author: {
                    name: "Sanjay Kumar",
                    role: "Founding GP",
                    img: "/images/sanjay_kumar_portrait.png"
                },
                content: `
                    <p>At Lemniscate Investments, we have always believed that early-stage investing is about high-conviction partnerships. We don't believe in spraying and praying. Rather, we back technical builders reimagining industry infrastructure with meaningful capital and long-term support.</p>
                    
                    <p>Recently, we crossed a milestone: a combined <strong>$1 million</strong> deployed across our three leading portfolio companies. In this article, we'll examine how we put this capital to work and the underlying thesis that drives our Venture Capital division.</p>
                    
                    <h3>Our Portfolio Cornerstones</h3>
                    <p>Our combined investment spans three pioneering startups that represent the future of deep technology and digital workflow infrastructure:</p>
                    <ul>
                        <li><strong>PetaBytz Technologies:</strong> Innovating in cloud-native scalable data pipelines and computational clustering.</li>
                        <li><strong>Bluebix Solutions:</strong> Revolutionizing next-generation enterprise workflows and customer operations with custom telemetry.</li>
                        <li><strong>SoftStandard Solutions:</strong> Scaling technical standards, security systems, and infrastructure integrations.</li>
                    </ul>

                    <blockquote>
                        "Our investment strategy focuses on deep technical capabilities. We look for teams that don't just build applications, but build the fundamental systems that other companies rely on."
                    </blockquote>

                    <h3>Strategic Alignment and Support</h3>
                    <p>Deploying $1M is only the first step. Our team—comprising former founders, deep-tech researchers, and SaaS operators—works closely with these companies on growth strategies, architectural reviews, and customer development. By maintaining a highly focused portfolio, we ensure that every founder receives the full support of the Lemniscate partner network.</p>
                    
                    <p>In the coming quarters, we plan to expand our venture cohort, targeting Pre-Seed and Series A opportunities where we can leverage our technical background to accelerate time-to-market.</p>
                `
            },
            {
                id: 2,
                category: "equities",
                categoryLabel: "Equities & Portfolio",
                title: "Managing a Modern Equities Portfolio: Active US & Indian Dual-Market Allocation",
                desc: "An inside look at our active trading strategies in the US and Indian equity markets, navigating macro trends, and managing $200k USD in assets under management (AUM).",
                date: "June 22, 2026",
                readTime: "8 min read",
                author: {
                    name: "Elena Rostova",
                    role: "Partner, AI & Quantitative Strategies",
                    img: "/images/elena_rostova_portrait.png"
                },
                content: `
                    <p>The global macroeconomic landscape in 2026 demands flexibility. Rather than limiting ourselves to domestic equities, Lemniscate actively manages a dual-market portfolio, investing in both US and Indian equities. Currently managing <strong>$200k USD in Assets Under Management (AUM)</strong>, we leverage local insights and algorithmic models to generate alpha across borders.</p>

                    <h3>Why the US & Indian Corridor?</h3>
                    <p>The synergy between US technology leadership and Indian industrial and digital expansion offers an unparalleled risk-adjusted return profile. While the US market provides exposure to hyper-scale SaaS and generative AI systems, the Indian market (tracked via NSE and BSE indices) offers explosive growth in banking, manufacturing, and consumer tech.</p>

                    <blockquote>
                        "Dual-market allocation is not just about diversification; it is about capital efficiency. When US markets face valuation pressures, the Indian growth engines provide strong counterbalancing tailwinds."
                    </blockquote>

                    <h3>Active Risk Management</h3>
                    <p>Our trading engine monitors key volatility indicators (such as the CBOE VIX) and simulates live market feeds to execute high-conviction trades. Managing a dual-market system requires strict attention to currency fluctuations, geopolitical developments, and regulatory frameworks. By maintaining a focused $200k AUM, we stay highly liquid and capable of executing tactical pivots as market conditions shift.</p>

                    <p>We believe that active, quantitative management is the key to outperforming passive benchmarks in today's high-interest-rate environment.</p>
                `
            },
            {
                id: 3,
                category: "advisory",
                categoryLabel: "Wealth Advisory",
                title: "Custom Goal-Based Wealth Advisory: A Tailor-Made Asset Allocation Playbook",
                desc: "How we move beyond standard models to provide bespoke asset allocation strategies that align precisely with our clients' long-term requirements and lifestyle goals.",
                date: "June 15, 2026",
                readTime: "5 min read",
                author: {
                    name: "Sarah Kim",
                    role: "Partner, Fintech & Wealth Systems",
                    img: "/images/sarah_kim_portrait.png"
                },
                content: `
                    <p>Traditional wealth advisory has become commoditized. Standard risk tolerance questionnaires often lead to generic 60/40 portfolios that fail to capture a client's true objectives. At Lemniscate, we have replaced template models with <strong>tailor-made asset allocation based on clients' requirements and goals</strong>.</p>

                    <h3>Aligning Capital with Objectives</h3>
                    <p>Our wealth advisory framework begins with a blank sheet. We work closely with individuals, family offices, and operators to understand their cash flow needs, tax considerations, and generational milestones. We separate wealth preservation from growth-oriented venture plays, constructing bespoke portfolios that might include liquid equities, venture debt, and direct private investments.</p>

                    <blockquote>
                        "No two clients are identical. Standard allocations fail to account for private equity lockups, startup options, or direct real estate exposure. True advisory must be bespoke."
                    </blockquote>

                    <h3>Integrated Advisory Ecosystem</h3>
                    <p>By combining our Wealth Advisory insights with our direct access to Venture Capital and Alternative Investments, we offer clients a unique look at off-market deals. We advise on tax-efficient structuring, transition planning, and cross-border assets, ensuring that our clients' wealth grows in alignment with their values and expectations.</p>
                `
            },
            {
                id: 4,
                category: "alternatives",
                categoryLabel: "Alternative Markets",
                title: "Beyond Public Markets: Designing a Resilient Alternative Portfolio",
                desc: "Exploring our advisory framework for crypto, real estate, private equity, and commodities investments to capture high-alpha opportunities outside the public domain.",
                date: "June 08, 2026",
                readTime: "7 min read",
                author: {
                    name: "Marcus Aurelius",
                    role: "Partner, Alternative Investments",
                    img: "/images/marcus_aurelius_portrait.png"
                },
                content: `
                    <p>As public market correlations converge, true diversification is increasingly difficult to achieve. Standard bond and equity splits no longer guarantee safety. To build resilient portfolios, Lemniscate advises clients on four critical pillars of alternative assets: <strong>crypto, real estate, private equity, and commodities investments</strong>.</p>

                    <h3>The Four Pillars of Alternatives</h3>
                    <ul>
                        <li><strong>Crypto &amp; Digital Assets:</strong> We focus on liquid protocols (Bitcoin, Ethereum, Solana) and decentralization infrastructure that provide asymmetric upside.</li>
                        <li><strong>Real Estate:</strong> Yield-generating commercial assets, logistics centers, and private residential pools offering solid cash flow and inflation hedges.</li>
                        <li><strong>Private Equity:</strong> Direct stakes in private mid-market firms and special situations that operate independently of public equity market corrections.</li>
                        <li><strong>Commodities:</strong> Hard assets like gold and raw materials that serve as defensive backstops during periods of currency debasement.</li>
                    </ul>

                    <blockquote>
                        "Alternative assets are no longer speculative accessories. They are critical building blocks for modern risk-adjusted portfolios."
                    </blockquote>

                    <h3>Active Underwriting</h3>
                    <p>Our Alternative Investment division applies rigorous underwriting and due diligence to every asset class. We advise on entry valuations, liquidity risks, and custodial infrastructure. By integrating alternative markets, we help clients capture non-correlated yields and high-alpha opportunities that standard brokers overlook.</p>
                `
            }
        ];
        writeBlogs(defaultBlogs);
        return defaultBlogs;
    }
    try {
        const data = fs.readFileSync(BLOGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading blogs file:', error);
        return [];
    }
};

// Endpoints
app.get('/api/blogs', (req, res) => {
    try {
        const blogs = readBlogs();
        // Sort newest first
        blogs.sort((a, b) => b.id - a.id);
        res.json(blogs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve blogs' });
    }
});

app.get('/api/blogs/:id', (req, res) => {
    try {
        const blogs = readBlogs();
        const blog = blogs.find(b => b.id === parseInt(req.params.id));
        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }
        res.json(blog);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve blog' });
    }
});

// Configure upload fields for blog
const blogUploadConfig = upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'blogVideo', maxCount: 1 }
]);

app.post('/api/blogs', requireAdminAuth, blogUploadConfig, (req, res) => {
    try {
        const { title, category, authorName, authorRole, authorImgSelect, readTime, desc, content, publishDate } = req.body;
        
        if (!title || !category || !authorName || !desc || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let authorImg = '/images/sanjay_kumar_portrait.png'; // default
        if (authorImgSelect) {
            authorImg = authorImgSelect;
        }

        const coverImageFile = req.files && req.files['coverImage'] ? `/uploads/${req.files['coverImage'][0].filename}` : null;
        const blogVideoFile = req.files && req.files['blogVideo'] ? `/uploads/${req.files['blogVideo'][0].filename}` : null;

        const blogs = readBlogs();
        
        // Generate new ID (numeric max + 1)
        const nextId = blogs.length > 0 ? Math.max(...blogs.map(b => b.id)) + 1 : 1;

        // Map category ID to Category Label
        const categoryLabels = {
            'venture': 'Venture Capital',
            'equities': 'Equities & Portfolio',
            'advisory': 'Wealth Advisory',
            'alternatives': 'Alternative Markets'
        };
        const categoryLabel = categoryLabels[category] || 'General';

        // Format Date like: "June 30, 2026"
        let formattedDate = '';
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        if (publishDate) {
            const dateParts = publishDate.split('-');
            if (dateParts.length === 3) {
                const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                formattedDate = dateObj.toLocaleDateString('en-US', options);
            }
        }
        if (!formattedDate) {
            formattedDate = new Date().toLocaleDateString('en-US', options);
        }

        const newBlog = {
            id: nextId,
            category,
            categoryLabel,
            title,
            desc,
            date: formattedDate,
            readTime: readTime || '5 min read',
            author: {
                name: authorName,
                role: authorRole || 'Partner',
                img: authorImg
            },
            content: content,
            coverImage: coverImageFile,
            video: blogVideoFile
        };

        blogs.push(newBlog);
        writeBlogs(blogs);

        res.status(201).json({ success: true, blog: newBlog });
    } catch (error) {
        console.error('Error creating blog:', error);
        res.status(500).json({ error: 'Failed to create blog' });
    }
});

app.delete('/api/blogs/:id', requireAdminAuth, (req, res) => {
    try {
        const blogs = readBlogs();
        const filtered = blogs.filter(b => b.id !== parseInt(req.params.id));
        if (blogs.length === filtered.length) {
            return res.status(404).json({ error: 'Blog not found' });
        }
        writeBlogs(filtered);
        res.json({ success: true, message: 'Blog deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete blog' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

