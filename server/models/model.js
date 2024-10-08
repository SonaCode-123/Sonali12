const mongoose = require('mongoose');

// Define schema for USER/NGO
const UserNGOSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullname: { type: String, required: true },
    email: { type: String, required: true },
    contactNumber: { type: String, required: true },
    address: { type: String, required: true },
});

// Define schema for Police
const PoliceCyberSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    department: { type: String, required: true },
    email: { type: String, required: true },
    contactNumber: { type: String, required: true },
    address: { type: String, required: true },
});

// Create models
const UserNGO = mongoose.model('UserNGO', UserNGOSchema);
const PoliceCyber = mongoose.model('PoliceCyber', PoliceCyberSchema);

module.exports = { UserNGO, PoliceCyber };
