// Step names and try lines for the plan checker, in three groups. Precision beats recall: an error
// must never block a real user step, so a fuzzy case goes in mustWarn, not mustError.
// Seeded from the reviews of the thin-steps change (2026-11-24).
export const mustError = {
  names: [
    "Database", "Set up the database", "Set up the database schema", "Build the API endpoints", "Build the UI",
    "API and services", "Backend setup", "Frontend components", "Wire up the data layer",
    "Notes API", "Notes APIs", "notes-api", "Notes Api", "APIs for notes", "Sharing backend", "Notes back-end", "BACKEND for notes",
    "UI-only list", "Items endpoint", "Booking Endpoints", "Data model for items", "Frontend for the list", "Booking Frontend", "Front-End list",
    "Bookings DB", "Bookings table", "Bookings tables", "Booking models", "Booking Data-Model", "Booking service layer", "Booking servicelayer",
    "the booking schema", "Booking Server", "Booking server", "Booking UI", "Booking ORM", "Booking migration", "Booking web API",
    "Booking REST-ful API", "Booking SQL",
  ],
  tryLines: [
    "The migration runs", "curl /api/v1/items returns 200", "All the unit tests pass in CI", "Nothing visible yet, the row is in the database",
    "Call the endpoint and get the notes back", "Run a query: the new row is there", "Hit the items API and see the new item", "Open Postman and send the request",
    "Run the migration and see the new column", "Open psql and select from bookings", "Use curl to post a booking", "Run npm test: it passes",
    "Send a GET to /api/v1/bookings: it lists them", "Open the Network panel and see a 200", "Hit /api/v1/bookings in the browser: JSON shows",
  ],
};

export const mustWarn = {
  names: [
    "Create the tables", "Wire up the services", "Items repository", "Booking screens", "Booking repo", "Booking persistence", "Booking storage",
    "Booking auth middleware", "Booking controller", "Booking handlers", "Booking webhook", "Booking store", "Booking queries", "Booking DTOs",
    "Booking types", "Booking hooks",
  ],
  tryLines: ["Check Sentry: no errors show up", "Open Drizzle Studio: the row is there", "Inspect the D1 table: one row", "Check the logs: no errors show up"],
};

export const mustPass = {
  names: [
    "Add an item", "Create a table of scores", "See the list page", "Sign in", "Seed data you can browse", "Share a route with a friend",
    "Share the list", "Copy your API key", "Book a service", "Pick a car model", "Restore a deleted item", "Back up the list",
    "Add a service", "Add services", "Add a route", "Add a server", "Add a component", "Pick a model", "Add a car model", "Paste an API key",
    "Save the API key", "Add an API token", "Plan a route", "Join a server", "Create a table", "Add a table", "Rename the data",
    "Show the schema of a form", "Edit the menu", "Export data", "Add a layer to the map", "Choose a database to connect", "Migrate my old notes", "List repository",
  ],
  tryLines: [
    "Share the list with a flatmate: they see it on their phone", "Open the activity page: your last change shows first",
    "Open Services, add Haircut: it shows in the list", "Choose the model Corolla: its price shows", "Paste your API key and press Save: it says connected",
    "Tap Settings, then API key: the key is masked", "Plan a route from home to work: the map draws it", "Open the console page and press Start: a game begins",
    "Check the log of past visits: today's visit is at the top", "Open the server list and tap Join: you're in", "Look at the activity log: your edit is listed",
    "Read the logs page: your login shows", "Call the shop: no wait, tap Call and the dialer opens", "Tap Endpoint settings: it shows your webhook URL",
  ],
};
