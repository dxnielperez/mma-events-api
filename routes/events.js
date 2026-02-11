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

  try {
    // 1 Serve fresh cache if valid
    if (!forceRefresh && isCacheFresh() && cachedData) {
      console.log("Serving fresh cache");
      return res.json(cachedData);
    }

    console.log("Starting new scrape...");

    const events = await fetchUpcomingEvents();
    const detailedEvents = await fetchEventDetails(events);

    console.log(
      `Scrape result: ${detailedEvents.length} / ${events.length} events`,
    );

    // 2️ Validate scrape health before overwriting cache
    const MIN_SUCCESS_RATE = 0.7; // 70% must succeed
    const successRate = detailedEvents.length / events.length;

    if (!detailedEvents.length || successRate < MIN_SUCCESS_RATE) {
      console.warn("Scrape appears degraded. Keeping existing cache.");

      if (cachedData) {
        return res.json(cachedData);
      }

      return res.status(503).json({
        message: "Scrape degraded and no cache available",
      });
    }

    // 3️ Extra safety: ensure we didn’t shrink drastically vs cache
    if (cachedData && detailedEvents.length < cachedData.length * 0.6) {
      console.warn(
        "New scrape significantly smaller than previous. Keeping old cache.",
      );
      return res.json(cachedData);
    }

    // 4️ Safe to write cache
    writeCache(detailedEvents);
    console.log("Cache updated successfully");

    res.json(detailedEvents);
  } catch (error) {
    console.error("Scrape failed:", error.message);

    if (cachedData) {
      console.log("Serving stale cache due to scrape failure");
      return res.json(cachedData);
    }

    res.status(500).json({
      message: "Failed to fetch events",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
