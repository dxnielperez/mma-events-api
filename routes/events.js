const express = require("express");
const router = express.Router();
const {
  fetchUpcomingEvents,
  fetchEventDetails,
} = require("../scrapers/tapology");
const { isCacheFresh, readCache, writeCache } = require("../utils/cache");

router.get("/", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const orgMode = req.query.orgs || "major"; // default to major; options: major, all

  try {
    if (!forceRefresh && isCacheFresh()) {
      const cachedData = readCache();
      if (cachedData) {
        return res.json(cachedData);
      }
    }

    const events = await fetchUpcomingEvents(orgMode);
    const detailedEvents = await fetchEventDetails(events);

    writeCache(detailedEvents);
    res.json(detailedEvents);
  } catch (error) {
    console.error("API error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch events", error: error.message });
  }
});

module.exports = router;
