const puppeteer = require('puppeteer');

const criteria = {"nbCandidature": 5, "maxPrice": 600};

const fs = require('fs');
// Lire le contenu du fichier JSON
const jsonContent = fs.readFileSync('./secret.json', 'utf-8');
// Parser le contenu JSON
const secretData = JSON.parse(jsonContent);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendSMS(message) {
    const accountSid = secretData.sid;
    const authToken = secretData.token;
    const client = require('twilio')(accountSid, authToken);

    client.messages.create({
        body: message,
        from: secretData.from,
        to: secretData.to
    });
}

async function checkHomeAvailable() {
    // 1. Lancer le navigateur
    console.log("Lancer le navigateur");
    const browser = await puppeteer.launch({headless: 'new'});
    const page = await browser.newPage();

    // 2. Aller sur la page de connexion
    console.log("Aller sur la page de connexion => https://offres.passlogement.com/");
    await page.goto('https://offres.passlogement.com/');

    // 3. Remplir les champs et se connecter
    console.log("Remplir les champs");
    await page.type('#username-inputEl', secretData.user);
    await page.type('#password-inputEl', secretData.password);

    console.log("se connecter");
    await page.click("#button-1012-btnInnerEl");

    console.log("patienter ...");
    await sleep(6000);

    // Utilisez page.evaluate pour exécuter une fonction JavaScript personnalisée dans le contexte de la page
    await page.evaluate(() => {
        // Trouver l'élément qui a le texte "Les offres" et cliquer dessus
        const offersTab = Array.from(document.querySelectorAll('li.tab')).find(tab => tab.textContent.includes('Les offres'));
        if (offersTab) {
        offersTab.click();
        } else {
        console.error('Élément "Les offres" non trouvé');
        }
    });
    await sleep(5000);

    // Attendez que le tableau soit présent sur la page
    await page.waitForSelector('.x-grid-table-resizer');

    // Récupérez les données du tableau
    const tableData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.x-grid-row'));
        return rows.map(row => {
            const cells = Array.from(row.querySelectorAll('.x-grid-cell-inner'));
            return cells.map(cell => cell.textContent.trim());
        });
    });

    let homeFree = [];
    // Vérifiez les conditions et effectuez l'action souhaitée
    tableData.forEach(row => {
        const nbCandidature = parseInt(row[row.length - 1], 10); // La dernière colonne est "Nb de candidature en cours"
        let loyer; // La colonne "Loyer"

        // Recherche de la valeur qui contient le symbole '€'
        const prixIndex = row.findIndex(value => value.includes('€'));

        // Vérifier si le prix a été trouvé
        if (prixIndex !== -1) {
            // Extraire le montant du loyer en supprimant le symbole '€' et en le convertissant en entier
            loyer = parseInt(row[prixIndex].replace('€', ''), 10);
            
            if (nbCandidature < criteria.nbCandidature && loyer < criteria.maxPrice) {
                homeFree.push(row);
            }
        }
        else{
            if (nbCandidature < criteria.nbCandidature) {
                homeFree.push(row);
            }
        }
    });
    await sleep(5000);

    // 6. Envoyer un SMS si des logements sont disponibles
    if (homeFree.length > 0) {
        await sendSMS("Des logements sont disponibles: " + homeFree.join(" | "));
    } else {
        console.log("Aucun logement disponible");
    }

    await browser.close();
}

// On vérifie les logements une première fois puis toutes les 10 minutes
checkHomeAvailable();
setInterval(checkHomeAvailable, 1000 * 60 * 3);

