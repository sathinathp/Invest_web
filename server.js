const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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
        cb(null, 'pitch-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.post('/api/pitch', upload.single('pitchAudio'), (req, res) => {
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

        res.status(201).json({
            success: true,
            message: 'Pitch submitted successfully!',
            pitchId: pitchData.id,
            analysis: pitchData.analysis,
            sanjayFeedback: pitchData.sanjayFeedback
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

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
