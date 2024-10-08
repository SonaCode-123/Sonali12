const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("MONGO_URI is not defined in .env");
    process.exit(1);
}

mongoose.connect(uri)
    .then(() => {
        console.log("MongoDB connected");
    })
    .catch(err => {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    });

// Middleware to parse incoming request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Session configuration
app.use(session({
    secret: 'your_secret_key', // Change to a strong secret
    resave: false,
    saveUninitialized: true,
}));

// Ensure the 'uploads' folder exists
const uploadPath = path.join(__dirname, '../uploads/');
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

// Set up Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullname: { type: String, required: true },
    userType: { type: String, required: true, enum: ['individual', 'ngo', 'police'] },
    email: { type: String, required: true },
    contactNumber: { type: String, required: true },
    address: { type: String, required: true },
});

const User = mongoose.model('User', UserSchema);

// User Report Schema
const UserReportSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    approximateAge: { type: Number, required: true },
    photo: { type: String },
    gender: { type: String, required: true },
    lastSeenLocation: { type: String, required: true },
    addressDetails: { type: String, required: true },
    contactInfo: { type: String, required: true },
    personStatus: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

const UserReport = mongoose.model('UserReport', UserReportSchema);

// Police Report Schema
const PoliceReportSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    approximateAge: { type: Number, required: true },
    photo: { type: String },
    gender: { type: String, required: true },
    lastSeenLocation: { type: String, required: true },
    addressDetails: { type: String, required: true },
    contactInfo: { type: String, required: true },
    personStatus: { type: String, required: true },
    policeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

const PoliceReport = mongoose.model('PoliceReport', PoliceReportSchema);

// Route to render the home page (index.ejs)
app.get('/', (req, res) => {
    res.render('index');
});

// Route to render the signup page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// Route to handle signup form submission
app.post('/submit-signup', async (req, res) => {
    const { username, password, fullname, userType, email, contactNumber, address } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username is already taken.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword,
            fullname,
            userType,
            email,
            contactNumber,
            address,
        });

        await newUser.save();
        res.redirect('/report?userId=' + newUser._id);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating user. Please try again.' });
    }
});

// Route to render the login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Route to handle login form submission
app.post('/submit-login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid username or password.' });
        }

        // Store user info in session
        req.session.userId = user._id; // Store user ID in session
        req.session.userType = user.userType; // Store user type in session

        // Successful login; redirect to finding them page
        res.redirect('/findingthem'); // Pass user ID to the finding them page
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error logging in. Please try again.' });
    }
});

// Route to render the report page
app.get('/report', (req, res) => {
    const userId = req.query.userId;
    res.render('report', { userId });
});

// Route to handle report submission
app.post('/submit-report', upload.single('photo'), async (req, res) => {
    const { userId, userType, fullName, approximateAge, gender, lastSeenLocation, addressDetails, contactInfo, personStatus } = req.body;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const photoPath = req.file.path;
        let newReport;

        if (userType === 'police') {
            newReport = new PoliceReport({
                fullName,
                approximateAge,
                photo: photoPath,
                gender,
                lastSeenLocation,
                addressDetails,
                contactInfo,
                personStatus,
                policeId: userId,
            });
        } else {
            newReport = new UserReport({
                fullName,
                approximateAge,
                photo: photoPath,
                gender,
                lastSeenLocation,
                addressDetails,
                contactInfo,
                personStatus,
                userId,
            });
        }

        await newReport.save();

        // Perform face matching after saving the report
        const results = await matchFaces(photoPath);
        req.session.results = results; // Store results in session
        res.redirect('/findingthem'); // Redirect to finding them page
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error submitting report. Please try again.' });
    }
});

// Function to match faces
async function matchFaces(uploadedPhotoPath) {
    const matches = [];
    const policeReports = await PoliceReport.find({});
    
    if (policeReports.length === 0) {
        return matches; // Return empty matches if no police reports found
    }

    const policePhotos = policeReports.map(report => ({
        fullName: report.fullName,
        photo: report.photo,
        approximateAge: report.approximateAge,
    }));

    return new Promise((resolve, reject) => {
        const pythonScriptPath = path.join(__dirname, 'face_matcher.py');
        const command = `python "${pythonScriptPath}" "${uploadedPhotoPath}" '${JSON.stringify(policePhotos)}'`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing Python script: ${error.message}`);
                return reject(error);
            }

            if (stderr) {
                console.error(`Python script stderr: ${stderr}`);
                return reject(stderr);
            }

            try {
                console.log(`Python script stdout: ${stdout}`);
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (parseError) {
                console.error(`Error parsing Python output: ${parseError}`);
                reject(parseError);
            }
        });
    });
}

// Route to render the finding them page
app.get('/findingthem', (req, res) => {
    const userId = req.session.userId; // Get user ID from session
    if (!userId) {
        return res.redirect('/login'); // Redirect to login if not authenticated
    }
    const results = req.session.results || []; // Get results from session or empty array
    res.render('findingthem', { userId, results }); // Pass results to view
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.redirect('/findingthem');
        }
        res.redirect('/login'); // Redirect to login after logout
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
