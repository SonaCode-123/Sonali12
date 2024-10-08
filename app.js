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


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'))); 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));


app.use(session({
    secret: 'your_secret_key', 
    resave: false,
    saveUninitialized: true,
}));


const uploadPath = path.join(__dirname, '../uploads/');
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}


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

        
        req.session.userId = user._id; 
        req.session.userType = user.userType; 

        
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
        res.render('findingthem', { results, userId }); // Render findingthem page with results
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error submitting report. Please try again.' });
    }
});

// Function to match faces
async function matchFaces(uploadedPhotoPath) {
    const matches = [];
    const policeReports = await PoliceReport.find({});

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
    const userId = req.session.userId; 
    if (!userId) {
        return res.redirect('/login'); 
    }
    res.render('findingthem', { userId });
});


app.get('/view-image/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadPath, filename);

    // Check if the file exists
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).send('Image not found.');
        }

        res.sendFile(filePath);
    });
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
