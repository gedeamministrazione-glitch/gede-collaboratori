// Blocco l'accesso se l'utente NON è loggato
if (!localStorage.getItem("gede_logged_user")) {
    window.location.href = "/login.html";
}
