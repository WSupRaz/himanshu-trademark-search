# Himanshu Trademark Search

A small Next.js search portal for trademark names in the EUIPO Trademark Search API. API credentials are read only by the server route. Responses are normalized in memory and are not stored in a database.

## Run locally

1. Install Node.js 20.9 or later.
2. Run npm install.
3. Copy .env.example to .env.local.
4. Add your EUIPO API application Client ID and Client Secret to .env.local.
5. Run npm run dev and open http://localhost:3000.

With both credentials omitted, the app runs in Demo mode and returns two explicitly synthetic sample rows. If only one credential is set, it reports incomplete configuration instead of presenting samples.

## EUIPO access setup

EUIPO requires an EUIPO account, a registered application, and an approved subscription to the Trademark Search API. The app uses the documented server-to-server OAuth client credentials flow (scope=uid) and requires the subscription to be active. Set EUIPO_ENV=sandbox to use EUIPO's sandbox endpoints; production is the default.

The official API's terms and approved subscription plan govern API use. This app does not persist EUIPO responses. Review the current EUIPO API Conditions of Use before deployment.

## Verified API contract

The implementation follows the official Trademark Search 1.1.0 OpenAPI definition (https://dev.euipo.europa.eu/product/trademark-search_110/api/trademark-search) and EUIPO security guide (https://dev.euipo.europa.eu/security):

- POST https://euipo.europa.eu/cas-server-webapp/oidc/accessToken with form fields client_id, client_secret, grant_type=client_credentials, and scope=uid.
- GET https://api.euipo.europa.eu/trademark-search/trademarks with the documented query, page, and size parameters.
- The name filter uses the documented RSQL field wordMarkSpecification.verbalElement.
- Search result fields used: trademarks, totalElements, totalPages, page; each row reads applicationNumber, applicationDate, registrationDate, status, niceClasses, wordMarkSpecification.verbalElement, and applicants[].name.
- API credentials are never sent to the browser. The server applies a 15-second timeout and returns clear messages for rejected credentials/subscriptions, rate limits, and upstream failures.

EUIPO's client-credentials flow may return less information than its user-authorized flow in some cases. The portal renders fields that the API returns and displays a dash when a field is absent.
