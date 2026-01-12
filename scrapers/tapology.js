const axios = require("axios");
const cheerio = require("cheerio");

const baseUrl = "https://www.tapology.com";
const majorOrgs = ["UFC", "PFL", "BELLATOR", "ONE", "RIZIN"];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const axiosClient = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.tapology.com/",
    Connection: "keep-alive",
  },
});

const isBlockedResponse = (html) => {
  const lower = html.toLowerCase();
  return (
    lower.includes("captcha") ||
    lower.includes("cloudflare") ||
    lower.includes("access denied") ||
    lower.includes("enable javascript")
  );
};

const fetchUpcomingEvents = async (orgMode = "major") => {
  const url =
    orgMode === "all"
      ? `${baseUrl}/fightcenter?schedule=upcoming`
      : `${baseUrl}/fightcenter?group=major&schedule=upcoming`;

  const { data: html } = await axiosClient.get(url);

  if (isBlockedResponse(html)) {
    throw new Error("Blocked while fetching upcoming events");
  }

  const $ = cheerio.load(html);
  const events = [];

  $("a[href^='/fightcenter/events/']").each((_, el) => {
    const title = $(el).text().trim();
    if (!title) return;

    events.push({
      title,
      link: baseUrl + $(el).attr("href"),
    });
  });

  return events.slice(0, 50);
};

/* -------------------------
   EVENT DETAILS
-------------------------- */

const fetchEventDetails = async (events) => {
  const results = [];

  for (const event of events) {
    try {
      const { data: html } = await axiosClient.get(event.link);

      if (isBlockedResponse(html)) {
        console.warn(`Blocked on event page: ${event.link}`);
        await delay(10000);
        continue;
      }

      const $ = cheerio.load(html);

      let fullOrganization = "Unknown";
      const bodyText = $("body").text();
      const promoMatch = bodyText.match(/Promotion:\s*([^\n•]+)/i);
      if (promoMatch) fullOrganization = promoMatch[1].trim();

      const orgMap = {
        "Ultimate Fighting Championship": "UFC",
        "Professional Fighters League": "PFL",
        "Bellator MMA": "BELLATOR",
        "ONE Championship": "ONE",
        "Rizin Fighting Federation": "RIZIN",
        "Absolute Championship Akhmat": "ACA",
        "Konfrontacja Sztuk Walki": "KSW",
        "Cage Warriors": "CW",
        "Invicta FC": "INVICTA",
        "Oktagon MMA": "OKTAGON",
        "Legacy Fighting Alliance": "LFA",
      };

      let organization = orgMap[fullOrganization] || fullOrganization;

      if (organization === "Unknown") {
        const upperTitle = event.title.toUpperCase();
        organization =
          majorOrgs.find((org) => upperTitle.includes(org)) || "Unknown";
      }

      const fights = [];

      $("ul[data-event-view-toggle-target='list'] li").each((_, el) => {
        const fighterContainers = $(el).find(
          ".div.flex.flex-row.gap-0\\.5.md\\:gap-0.w-full"
        );

        if (fighterContainers.length < 2) return;

        const parseFighter = (container, recordSelector) => ({
          name: container.find(".link-primary-red").text().trim(),
          record: container.find(recordSelector).text().trim(),
          picture:
            container
              .find(
                ".w-\\[77px\\].h-\\[77px\\].md\\:w-\\[104px\\].md\\:h-\\[104px\\].rounded"
              )
              .attr("src") || null,
          link: container.find(".link-primary-red").attr("href")
            ? baseUrl + container.find(".link-primary-red").attr("href")
            : null,
        });

        const fighterA = parseFighter(
          fighterContainers.eq(0),
          ".text-\\[15px\\].md\\:text-xs.order-2"
        );

        const fighterB = parseFighter(
          fighterContainers.eq(1),
          ".text-\\[15px\\].md\\:text-xs.order-1"
        );

        if (!fighterA.name || !fighterB.name) return;

        fights.push({ fighterA, fighterB });
      });

      if (!fights.length) continue;

      results.push({
        ...event,
        fights,
        organization,
        fullOrganization,
      });

      await delay(2000);
    } catch (err) {
      console.error(`Failed event ${event.link}:`, err.message);
      await delay(5000);
    }
  }

  return results;
};

module.exports = {
  fetchUpcomingEvents,
  fetchEventDetails,
};
