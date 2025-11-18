async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    const res = await fetch("/data/users.json");
    const data = await res.json();

    const user = data.users.find(
        u => u.username === username && u.password === password
    );

    if (user) {
        localStorage.setItem("gede_logged_user", username);
        window.location.href = "/dashboard.html";
    } else {
        alert("Credenziali errate");
    }
}

function logout() {
    localStorage.removeItem("gede_logged_user");
    window.location.href = "/login.html";
}
