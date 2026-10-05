# Guide utilisateur

Ce guide décrit l'app du point de vue de la personne qui l'utilise pour son foyer. Le « pourquoi »
(franchise, modèles, LCA, délais) est expliqué dans [concepts.md](concepts.md). L'installation
et l'administration d'une instance sont dans [exploitation/](exploitation/).

> L'app est une aide à la décision, pas un conseil en assurance. Vérifiez toujours les conditions
> d'un modèle (liste de médecins, Telmed…) auprès de la caisse.

## Le menu

| Menu | Contenu |
|---|---|
| **Accueil** | La carte de l'année (où vous en êtes pour l'an prochain) et la liste des choses à faire |
| **Bilan** | La comparaison et le changement de l'automne |
| **Foyer** (ou **Moi** pour une personne seule) | Personnes, adresse, contrats LAMal et complémentaires |
| **Historique** | Primes payées année après année, économies des bilans, position face au marché |
| **Réglages** | Primes officielles, CO2, caisses, rappels, accès à *Mon compte*, *Mes données* et *Donner un avis* |

## L'accueil

En haut, **la carte de l'année** dit où vous en êtes pour l'an prochain, avec un montant, une
phrase et un seul bouton :

| Moment | La carte montre | Bouton |
|---|---|---|
| Primes de l'an prochain pas encore publiées | Votre prime actuelle par mois | aucun |
| Primes publiées, bilan pas commencé | Ce que vous paierez sans rien faire, la hausse et l'économie possible | Commencer le bilan |
| Choix en cours | Le total avec vos choix, combien de personnes ont choisi | Choisir pour la personne suivante |
| Tout choisi, courriers à envoyer | L'économie prévue et le nombre de courriers à envoyer | Envoyer les courriers |
| Terminé | La prime de l'an prochain et l'économie réalisée, sur fond vert | Voir le bilan |
| Délai passé sans envoi | La prime de l'an prochain : la caisse renouvelle aux nouvelles conditions | aucun |

Touchez la carte pour voir le détail par personne. Pendant la période de changement, un compte à
rebours indique les jours restants avant le 30 novembre.

Dessous, **À faire** liste les autres tâches, la plus urgente en haut : courriers à envoyer,
signatures, choix à faire, produit de votre caisse à préciser, contrat de l'année à indiquer,
compte à sécuriser (passkey ou double facteur). La tâche déjà sur le bouton de la carte n'y est
pas répétée. « Tout est à jour » quand il n'y a rien d'autre.

## Premiers pas

### Créer son compte

L'inscription se fait sur **invitation** : l'administrateur de l'instance vous envoie un lien.
Vous choisissez votre courriel et un mot de passe (12 caractères au moins, refusé s'il figure dans
une fuite connue), puis vous confirmez votre adresse par le lien reçu (valable 24 heures). Une
passkey vous est proposée tout de suite.

Pour rejoindre le foyer d'un conjoint, utilisez le lien qu'il vous a créé (voir
[Partager son foyer](#partager-son-foyer)) : vous arrivez directement dans son foyer.

### L'accueil guidé

À la première connexion, l'accueil (`/bienvenue`) demande d'abord **pour qui** gérer l'assurance :

- **une personne seule** : Pour qui → Vous (identité et adresse) → Contrat ;
- **un foyer** : Pour qui → Adresse → Personnes → Contrats.

À l'étape de l'identité ou de l'adresse, le plus rapide est de **partir du PDF de la police** : les
personnes, l'adresse et les contrats en sont lus, il ne reste qu'à vérifier. Sinon, une saisie
guidée pose quelques questions. Ajouter une deuxième personne fait passer en mode foyer.

### Le foyer et les personnes

Dans *Foyer* :

- **Adresse** : le code postal propose la commune et la **région de primes**. Si le code postal
  couvre plusieurs communes, choisissez la vôtre ; la région figure aussi sur la police.
- **Personnes** : prénom, nom, date de naissance. Cochez « assuré contre les accidents par
  l'employeur » si la personne travaille au moins 8 heures par semaine : l'accident peut alors
  être exclu de la LAMal.
- **Contrat LAMal** de l'année en cours, pour chaque personne : *Ajouter un contrat* propose
  d'importer le PDF de la police ou de saisir à la main la caisse, le tarif officiel, la
  franchise et la prime réellement facturée. Vous pouvez aussi saisir les contrats des années
  passées (2010 et suivantes) : l'historique se construit à partir d'eux.
- **Complémentaires (LCA)** : choisissez la garantie dans la liste ; l'assureur est prérempli
  d'après la caisse LAMal. Les enregistrer permet à l'app de vous les rappeler au moment de
  résilier la LAMal.

### Importer une police

Sur la fiche d'une personne, *Ajouter un contrat › Importer le PDF de la police* lit votre
police : caisse, personnes, tarif officiel, franchise, prime, numéro d'assuré (ou AVS) et
complémentaires. La personne de la fiche est retenue d'office ; si la police couvre toute la
famille, les autres personnes trouvées sont proposées, décochées. Le fichier est lu en mémoire
sur le serveur de l'app, sans service externe, et n'est jamais enregistré. Vous vérifiez avant
d'enregistrer. L'import est aussi proposé à la première configuration.

### Partager son foyer

*Foyer › Accès au foyer › Inviter* (propriétaire du foyer seulement) crée un lien valable
**48 heures**, à usage unique. La personne invitée devient **membre** : elle voit tout, prépare
le bilan et signe ses lettres, mais ne peut ni inviter, ni retirer quelqu'un, ni effacer le
foyer.

## Le bilan d'automne

Chaque automne, l'app vous aide à vérifier que vous payez le juste prix pour l'année suivante.

| Quand | Ce qui se passe |
|---|---|
| Fin septembre | L'OFSP publie les primes de l'an prochain. L'app les importe toute seule et envoie une notification. |
| Dès la publication | Le bilan s'ouvre seul. La carte de l'accueil montre la **hausse** : ce que vous paierez sans rien faire. |
| Octobre – mi-novembre | Préférences, comparaison, choix, envoi des courriers. |
| Avant le 30 novembre | Vos lettres doivent être **reçues** par la caisse. L'app indique la date d'envoi conseillée (environ une semaine avant). Le bilan se termine seul quand tout est envoyé. |
| Décembre – janvier | Les caisses confirment par courrier : gardez ces confirmations. |

Le bilan se trouve dans le menu *Bilan*. Une frise montre où vous en êtes :
**Hausse → Préférences → Choix → Envoi**.

### 1. La hausse

Pour chaque personne, l'app retrouve le tarif de l'an prochain chez votre caisse actuelle
(même modèle, même franchise) et affiche l'écart avec cette année. Si elle n'est pas sûre du
tarif qui succède au vôtre, elle vous demande de confirmer la correspondance.

Si une personne change de classe d'âge (enfant → jeune adulte, jeune adulte → adulte), un
avertissement l'indique.

### 2. Vos préférences

Une seule page, deux questions :

1. **Qu'est-ce qui compte le plus ?**
   - **Payer le moins possible** : tous les modèles et la franchise la moins chère sur l'année ;
   - **Ne rien changer au quotidien** : même modèle, même franchise, seule la caisse change.

   Chaque choix affiche l'économie annuelle qu'il permettrait.
2. **À quelle fréquence allez-vous chez le médecin ?** (presque jamais, quelques consultations,
   suivi régulier, traitement lourd, ou vos frais exacts). L'app en déduit les frais de santé
   attendus, qui servent au calcul du **coût total attendu** (prime nette de CO2, franchise et
   quote-part).

Sous **Affiner**, vous pouvez imposer une franchise, choisir les modèles acceptés et noter votre
médecin. Tout reste modifiable depuis la page du bilan.

### 3. Comparer et choisir

Le comparateur s'ouvre sur la première personne sans choix, avec des onglets pour passer d'une
personne à l'autre. Pour chacune :

- le **top 3** par coût total attendu, puis les autres caisses ;
- un sélecteur **Selon mes préférences / Toutes les offres**, et des filtres repliés (franchise,
  modèles, une ou toutes les offres de chaque caisse) ;
- un badge **Caisse solide** pour les caisses aux bonnes réserves et aux hausses modérées ;
- trois coûts par offre : sans frais, attendu, année chargée ;
- le portrait de chaque caisse (réserves, frais administratifs, taille, évolution de ses primes)
  et l'explication de chaque modèle ;
- **Comparer des offres** : 2 à 4 offres côte à côte.

Choisir une offre enregistre la décision : *Je garde*, *Je change de caisse* ou *Je change de
franchise ou de modèle*. Pour un modèle avec liste de médecins, vérifiez que le vôtre y figure.

### 4. Les démarches

La page *Démarches* guide pas à pas, dans l'ordre :

1. **Souscrire auprès de la nouvelle caisse** : demande d'affiliation (PDF et courriel
   prérempli). Faites-la avant de résilier : l'ancienne caisse ne vous libère qu'une fois la
   nouvelle confirmée. *Demander aussi des complémentaires* ajoute à la demande les garanties
   souhaitées (hospitalisation, dentaire…).
2. **Résilier chez la caisse actuelle** (ou **annoncer le changement** de franchise ou de
   modèle) : la lettre PDF est générée en un geste, au format enveloppe à fenêtre suisse. Un
   rappel en ambre sous la résiliation liste vos complémentaires : la lettre ne résilie que
   l'assurance de base, elles continuent.

**Signature.** Chaque adulte peut dessiner sa signature à l'écran ; elle est apposée sur les PDF
(pour un mineur, un parent signe). Une signature imprimée n'est pas une signature manuscrite
(art. 14 CO) : les caisses l'acceptent en général, mais pour une résiliation sans risque, signez
à la main.

**Envoi.** Deux possibilités :

- **Imprimer et poster** vous-même en **recommandé**, avant la date d'envoi conseillée, puis
  saisir le numéro de suivi et marquer la lettre envoyée. Le bouton *Partager* envoie le PDF vers
  une autre app du téléphone.
- **Confier à Pingen**, seulement si l'administrateur l'a autorisé pour votre foyer : Pingen
  imprime la lettre avec la signature dessinée et la remet à la Poste en recommandé. Le numéro
  de suivi et le prix reviennent seuls dans l'app. Une lettre refusée par Pingen (adresse
  illisible, par exemple) est signalée par une notification et peut être reprise.

### 5. La fin du bilan

Le bilan se termine **tout seul** dès que le dernier courrier est marqué envoyé (ou, si tout le
monde garde son contrat, dès le dernier choix) : les contrats de l'année suivante sont
enregistrés et l'historique est mis à jour. Un contrat de l'année suivante déjà saisi à la main
ou importé d'un PDF est gardé tel quel. Si la prime facturée par la caisse diffère, ajustez-la
dans le contrat. Gardez les confirmations que les caisses vous envoient.

Annuler un envoi, ou une lettre refusée par Pingen, rouvre le bilan. En bas de la page,
*Modifier mes choix* le rouvre aussi (refus de la nouvelle caisse, erreur : les choix restent,
les contrats enregistrés sont retirés le temps de corriger), et *Recommencer à zéro* efface les
choix et les courriers de l'année pour repartir des nouvelles primes. Les courriers déjà postés
ne sont pas annulés.

## Rappels et notifications

Activez les notifications dans *Réglages › Rappels*. Elles demandent l'app installée sur l'écran
d'accueil et une adresse en HTTPS (sur iPhone : Safari › Partager › *Sur l'écran d'accueil*).

Vous recevez :

- une notification quand les primes de l'an prochain sont publiées ;
- des rappels 30, 14, 7, 3 et 1 jour(s) avant la date d'envoi conseillée, seulement s'il vous
  reste un courrier à poster (ou rien de préparé), puis un dernier rappel deux jours après ;
- une relance quand une caisse n'a pas confirmé trois semaines après votre envoi.

Les rappels à 7 jours, à 1 jour, le dernier rappel et les relances arrivent aussi par courriel
(sans nom de caisse ni donnée de santé).

## Mon compte

*Réglages › Mon compte* :

- **Identifiant** : courriel et mot de passe. Changer de courriel envoie un lien de confirmation à
  la nouvelle adresse ; une fois confirmée, l'**ancienne adresse est prévenue**.
- **Passkeys** : connexion sans mot de passe, par l'empreinte, le visage ou le code de
  l'appareil. Une passkey suffit pour se connecter.
- **Double facteur** : une app d'authentification (codes à six chiffres) et **dix codes de
  secours de 16 caractères**, chacun utilisable une fois. Gardez-les en lieu sûr : ils
  remplacent le téléphone perdu. Vous pouvez en créer de nouveaux ; les anciens ne valent alors
  plus.
- **Appareils connectés** : vos sessions ouvertes, que vous pouvez fermer. Une session expire
  après 30 jours sans visite, et au plus tard après 90 jours.
- **Activité récente** : connexions et changements de sécurité.

Après un changement de mot de passe, l'activation ou la désactivation du double facteur, la
création de nouveaux codes de secours, l'ajout ou le retrait d'une passkey, un **courriel de
sécurité** vous prévient. Une connexion depuis un nouvel appareil est signalée de la même façon.

Cinq mots de passe erronés verrouillent le compte quelques minutes. **Mot de passe oublié ?** sur
la page de connexion envoie un lien valable une heure ; le double facteur reste exigé.

## Mes données

*Mon compte › Mes données*. Les actions de cette page demandent de **confirmer votre identité**
(mot de passe ou passkey) ; la confirmation vaut 10 minutes.

- **Télécharger mes données** : une copie complète (JSON) et un récapitulatif lisible (PDF).
- **Journal du foyer** : les événements importants du foyer.
- **Supprimer mon compte** : si vous êtes seul dans le foyer, le foyer part avec vous ; sinon il
  reste aux autres membres, et le plus ancien devient propriétaire.
- **Supprimer le foyer** (propriétaire) : efface personnes, contrats, bilans, lettres et
  signatures pour tous les comptes du foyer. Les comptes restent et peuvent recommencer à zéro.

**Comptes inactifs.** Un compte sans connexion depuis **24 mois** reçoit deux rappels par
courriel (30 et 7 jours avant), puis il est supprimé. Sans courriel possible, rien n'est
supprimé.

## Donner un avis

*Réglages › Donner un avis* (ou le lien d'une page d'erreur) : un problème, une idée ou autre
chose. L'avis arrive chez l'administrateur ; cinq avis par compte et par jour au plus.
