const puppeteer = require('puppeteer');

const criteria = {"nbCandidature": 5, "maxPrice": 600, "reloadTime": 1};

const fs = require('fs');
// Lire le contenu du fichier JSON
const jsonContent = fs.readFileSync('./secret.json', 'utf-8');
// Parser le contenu JSON
const secretData = JSON.parse(jsonContent);

//===================== Block stocker les logements trouvés =======================//

// Chemin du fichier où vous souhaitez sauvegarder les données
const jsonFile = 'oldData.json';

// Fonction pour sauvegarder le tableau dans un fichier
function saveResultsToJson(array, oldAlreadyFound) {
    // Convertir le array en chaîne JSON
    oldArray = oldAlreadyFound.concat(array)
    const tableJSON = JSON.stringify(oldArray);

    // Écrire la chaîne JSON dans le fichier
    fs.writeFileSync(jsonFile, tableJSON);
}

// Fonction pour récupérer le tableau depuis le fichier
function getOldResults() {
    try {
        // Lire le contenu du fichier
        const jsonFileContent = fs.readFileSync(jsonFile, 'utf-8');

        // Si le fichier est vide, retourner un nouveau tableau vide
        if (!jsonFileContent) {
            return [];
        }

        // Sinon, convertir la chaîne JSON en tableau et le retourner
        return JSON.parse(jsonFileContent);
    } catch (erreur) {
        // En cas d'erreur (par exemple, si le fichier n'existe pas), retourner un nouveau tableau vide
        return [];
    }
}

function checkArrayTwoInArrayOne(array1, array2) {

    const array1String = JSON.stringify(array1);
    const array2String = JSON.stringify(array2);

    // Vérifier si la chaîne JSON de array1 est incluse dans la chaîne JSON de a2
    return array1String.includes(array2String) == true;
}

//===================== Block stocker les logements trouvés =======================//

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
    
    var oldFound = getOldResults();
    
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

    console.log("Recherche en cours, patienter ...\n");
    await sleep(6000);

    // Utilisez page.evaluate pour exécuter une fonction JavaScript personnalisée dans le contexte de la page
    await page.evaluate(() => {
        // Trouver l'élément qui a le texte "Les offres" et cliquer dessus
        const offersTab = Array.from(document.querySelectorAll('li.tab')).find(tab => tab.textContent.includes('Les offres'));
        if (offersTab) {
            offersTab.click();
        } else {
            console.error('\n<<<<<< Élément "Les offres" non trouvé >>>>>>>>\n');
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
                //Si le logement trouvés a déjà été notifié, ne pas le rajouté
                if(!checkArrayTwoInArrayOne(oldFound, row)){
                    homeFree.push(row);
                }
            }
        }
        else{
            if (nbCandidature < criteria.nbCandidature) {
                //Si le logement trouvés a déjà été notifié, ne pas le rajouté
                if(!checkArrayTwoInArrayOne(oldFound, row)){
                    homeFree.push(row);
                }
            }
        }
    });
    await sleep(5000);

    // 6. Envoyer un SMS si des logements sont disponibles
    if (homeFree.length > 0) {

        //Ajouter le logement trouvé
        saveResultsToJson(homeFree, oldFound);

        console.log("\n" + homeFree.length + " logement(s) disponible(nt), envoi de sms en cours ...");

        sendSMS("Des logements sont disponibles: " + homeFree.join(" ||| "));

        console.log("sms envoyé avec succès au "+secretData.to + "\n");
    }
    else {
        console.log("\nRecherche terminée, Aucun logement disponible.\n");
    }

    await browser.close();
    console.log("\nDéconnecter\n");
}

// On vérifie les logements une première fois puis toutes les x minutes
checkHomeAvailable();
setInterval(checkHomeAvailable, 1000 * 60 * criteria.reloadTime);

