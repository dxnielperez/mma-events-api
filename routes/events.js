const express = require("express");
const cors = require("cors");
const {
  fetchUpcomingEvents,
  fetchEventDetails,
} = require("./scrapers/tapology");

const { isCacheFresh, readCache, writeCache } = require("./utils/cache");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Track the last failed scrape in memory
let lastFailedScrape = 0;
const SCRAPE_RETRY_INTERVAL = 30 * 60 * 1000; // 30 minutes

app.get("/api/events", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const cachedData = readCache();

  // Prevent scraping too frequently after a failure
  if (!forceRefresh && Date.now() - lastFailedScrape < SCRAPE_RETRY_INTERVAL) {
    if (cachedData) return res.json(cachedData);
    return res
      .status(503)
      .json({ message: "Scraping temporarily unavailable" });
  }

  try {
    if (!forceRefresh && isCacheFresh() && cachedData) {
      return res.json(cachedData);
    }

    const events = await fetchUpcomingEvents();
    const detailedEvents = await fetchEventDetails(events);

    writeCache(detailedEvents);
    res.json(detailedEvents);
  } catch (err) {
    console.error("Scraping failed:", err.message);
    lastFailedScrape = Date.now();

    if (cachedData) {
      return res.json(cachedData); // serve stale cache
    }

    res
      .status(500)
      .json({ message: "Failed to fetch events", error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
