# Guide utilisateur

Ce guide décrit l'app du point de vue de la personne qui l'utilise pour son foyer. Le « pourquoi »
(franchise, modèles, LCA, délais) est expliqué dans [concepts.md](concepts.md). L'installation
et l'administration d'une instance sont dans [exploitation/](exploitation/).

> L'app est une aide à la décision, pas un conseil en assurance. Vérifiez toujours les conditions
> d'un modèle (liste de médecins, Telmed…) auprès de la caisse.

## Le menu

| Menu | Contenu |
|---|---|
| **Accueil** | La situation de l'année, et pendant l'automne la hausse annoncée et le compte à rebours |
| **Rituel** | La comparaison et le changement de l'automne |
| **Foyer** (ou **Moi** pour une personne seule) | Personnes, adresse, contrats LAMal et complémentaires |
| **Historique** | Primes payées année après année, économies des rituels, position face au marché |
| **Réglages** | Primes officielles, CO2, caisses, rappels, accès à *Mon compte*, *Mes données* et *Donner un avis* |

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
- **Contrat LAMal** de l'année en cours, pour chaque personne : caisse, tarif officiel,
  franchise et prime réellement facturée. Vous pouvez aussi saisir les contrats des années
  passées (2010 et suivantes) : l'historique se construit à partir d'eux.
- **Complémentaires (LCA)** : choisissez la garantie dans la liste ; l'assureur est prérempli
  d'après la caisse LAMal. Les enregistrer est important pour le contrôle LCA de l'automne.

### Importer une police

*Foyer › Importer une police* lit le PDF de votre police : caisse, personnes, tarif officiel,
franchise, prime, numéro d'assuré (ou AVS) et complémentaires. Le fichier est lu en mémoire sur
le serveur de l'app, sans service externe, et n'est jamais enregistré. Vous vérifiez avant
d'enregistrer. L'import est possible à tout moment, pas seulement à l'accueil.

### Partager son foyer

*Foyer › Accès au foyer › Inviter* (propriétaire du foyer seulement) crée un lien valable
**48 heures**, à usage unique. La personne invitée devient **membre** : elle voit tout, prépare
le rituel et signe ses lettres, mais ne peut ni inviter, ni retirer quelqu'un, ni effacer le
foyer.

## Le rituel d'automne

Chaque automne, l'app vous aide à vérifier que vous payez le juste prix pour l'année suivante.

| Quand | Ce qui se passe |
|---|---|
| Fin septembre | L'OFSP publie les primes de l'an prochain. L'app les importe toute seule et envoie une notification. |
| Dès la publication | Le rituel s'ouvre seul. L'accueil montre la **hausse** : ce que chaque personne paiera sans rien faire. |
| Octobre – mi-novembre | Stratégie, besoins, comparaison, choix, contrôle LCA, démarches. |
| Avant le 30 novembre | Vos lettres doivent être **reçues** par la caisse. L'app indique la date d'envoi conseillée (environ une semaine avant). |
| Décembre – janvier | Confirmations des caisses, puis clôture. |

Le rituel se trouve dans le menu *Rituel*. Une frise montre où vous en êtes :
**Hausse → Stratégie → Besoins → Choix → Démarches → Confirmé**.

### 1. La hausse

Pour chaque personne, l'app retrouve le tarif de l'an prochain chez votre caisse actuelle
(même modèle, même franchise) et affiche l'écart avec cette année. Si elle n'est pas sûre du
tarif qui succède au vôtre, elle vous demande de confirmer la correspondance.

Si une personne change de classe d'âge (enfant → jeune adulte, jeune adulte → adulte), un
avertissement l'indique.

### 2. La stratégie

Choisissez comment comparer :

- **Économie max** : le coût annuel le plus bas, quitte à changer de modèle ou de franchise ;
- **Maintien** : même modèle, même franchise, seulement la caisse la moins chère ;
- **Équilibre** : un bon prix chez une caisse solide (réserves, frais, hausses passées).

### 3. Les besoins

Pour chaque personne, indiquez la fréquence des consultations (presque jamais, quelques
consultations, suivi régulier, traitement lourd), la franchise souhaitée, les modèles acceptés
et, si besoin, votre médecin. L'app en déduit les frais de santé attendus, qui servent au calcul
du **coût total attendu** (prime nette de CO2, franchise et quote-part).

### 4. Comparer et choisir

Le comparateur s'ouvre sur la première personne sans choix, avec des onglets pour passer d'une
personne à l'autre. Pour chacune :

- le **top 3** selon votre stratégie, puis toutes les autres offres de votre région ;
- des filtres (franchise, modèles, caisses exclues) ;
- trois coûts par offre : sans frais, attendu, année chargée ;
- un **simulateur de franchise** qui montre à partir de quels frais une franchise basse devient
  plus avantageuse ;
- le portrait de chaque caisse (réserves, frais administratifs, taille, évolution de ses primes)
  et l'explication de chaque modèle ;
- **Comparer des offres** : 2 à 4 offres côte à côte.

Choisir une offre enregistre la décision : *Je garde*, *Je change de caisse* ou *Je change de
franchise ou de modèle*. Pour un modèle avec liste de médecins, vérifiez que le vôtre y figure.

### 5. Le contrôle LCA

Pour chaque personne qui change de caisse, l'étape *Complémentaires* rappelle ce que la
résiliation LAMal ne touche pas : vos complémentaires restent actives et facturées. Vous
indiquez aussi les complémentaires à demander à la nouvelle caisse. **Sans cette confirmation,
la lettre de résiliation ne peut pas être préparée.** Les alertes de cette étape sont en ambre.

### 6. Les démarches

La page *Démarches* guide pas à pas, dans l'ordre :

1. **Souscrire auprès de la nouvelle caisse** : demande d'affiliation (PDF et courriel
   prérempli), complémentaires souhaitées comprises. Faites-la avant de résilier : l'ancienne
   caisse ne vous libère qu'une fois la nouvelle confirmée.
2. **Résilier chez la caisse actuelle** (ou **annoncer le changement** de franchise ou de
   modèle) : la lettre PDF est générée en un geste, au format enveloppe à fenêtre suisse.
3. **Recevoir les confirmations** : cochez celle de la nouvelle caisse (affiliation) et celle de
   l'ancienne (fin du contrat au 31 décembre).

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

### 7. Clôturer

Quand chaque personne a une décision, **clôturez** le rituel : les contrats de l'année suivante
sont créés et l'historique est mis à jour. Si la prime facturée par la caisse diffère, ajustez-la
dans le contrat.

Un rituel, même clôturé, peut être **rouvert** (les choix restent, les contrats créés sont
retirés) ou **supprimé** (retour à l'état d'avant, lettres comprises).

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
- **Supprimer le foyer** (propriétaire) : efface personnes, contrats, rituels, lettres et
  signatures pour tous les comptes du foyer. Les comptes restent et peuvent recommencer à zéro.

**Comptes inactifs.** Un compte sans connexion depuis **24 mois** reçoit deux rappels par
courriel (30 et 7 jours avant), puis il est supprimé. Sans courriel possible, rien n'est
supprimé.

## Donner un avis

*Réglages › Donner un avis* (ou le lien d'une page d'erreur) : un problème, une idée ou autre
chose. L'avis arrive chez l'administrateur ; cinq avis par compte et par jour au plus.
