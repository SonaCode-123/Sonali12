// for active links
const activePage = window.location.pathname;
const navLinks = document.querySelectorAll('nav a');

navLinks.forEach(link => {
    const linkPath = new URL(link.href).pathname; // Get the link's path

    // Check for exact match for the homepage
    if (activePage === '/' && linkPath === '/') {
        link.classList.add('active');
    } 
    // Check if the link's path is a sub-path of the current page
    else if (activePage.startsWith(linkPath) && linkPath !== '/') {
        link.classList.add('active');
    }
});




// for toggle Menu
function toggleMenu() {
    const dropdown = document.getElementById("navDropdown");
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}
