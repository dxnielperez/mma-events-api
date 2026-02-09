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
    lower.includes("enable javascript") ||
    html.length < 25000
  );
};

/* -------------------------
   UPCOMING EVENTS
-------------------------- */

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
  const eventMap = new Map();

  $("a[href^='/fightcenter/events/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const link = baseUrl + href;
    if (eventMap.has(link)) return;

    const title = $(el).text().trim();
    if (!title) return;

    eventMap.set(link, { title, link });
  });

  return Array.from(eventMap.values()).slice(0, 40);
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
        console.warn(`Blocked or degraded page: ${event.link}`);
        await delay(15000);
        continue;
      }

      const $ = cheerio.load(html);

      /* ---------- EVENT META ---------- */

      const getMetaValue = (label) => {
        let value = null;

        $("li").each((_, el) => {
          const key = $(el).find("span.font-bold").text().trim();
          if (key.startsWith(label)) {
            value = $(el).find("span.text-neutral-700").first().text().trim();
          }
        });

        return value || null;
      };

      const date = getMetaValue("Date/Time:");
      const venue = getMetaValue("Venue:");
      const location = getMetaValue("Location:");

      /* ---------- ORGANIZATION ---------- */

      let fullOrganization = "Other";
      const promoMatch = $("body")
        .text()
        .match(/Promotion:\s*([^\n•]+)/i);

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

      const organization =
        orgMap[fullOrganization] ||
        majorOrgs.find((o) => event.title.toUpperCase().includes(o)) ||
        "Other";

      const promotionLinks = {};

      $("li")
        .filter((_, el) =>
          $(el).find("span.font-bold").text().includes("Promotion Links"),
        )
        .find("a[href]")
        .each((_, a) => {
          const href = $(a).attr("href");
          if (!href) return;

          if (href.includes("facebook.com")) promotionLinks.facebook = href;
          else if (href.includes("instagram.com"))
            promotionLinks.instagram = href;
          else if (href.includes("x.com") || href.includes("twitter.com"))
            promotionLinks.twitter = href;
          else if (href.includes("youtube.com")) promotionLinks.youtube = href;
          else if (href.includes("tiktok.com")) promotionLinks.tiktok = href;
          else if (href.includes("wikipedia.org"))
            promotionLinks.wikipedia = href;
          else promotionLinks.website = href;
        });

      /* ---------- FIGHTS ---------- */

      const fights = [];

      $("ul[data-event-view-toggle-target='list'] li").each((_, el) => {
        const fighterContainers = $(el).find(
          ".div.flex.flex-row.gap-0\\.5.md\\:gap-0.w-full",
        );

        if (fighterContainers.length < 2) return;

        const weightClass = (() => {
          const badge = $(el)
            .find("span.rounded")
            .filter((_, s) => {
              const text = $(s).text().trim();
              return /^\d{2,3}$/.test(text);
            })
            .first()
            .text()
            .trim();

          return badge ? `${badge} lbs` : null;
        })();

        const parseFighter = (container) => {
          const flagImg = container.find("img[src^='/assets/flags']").first();

          const pictureImg = container
            .find("img[src^='https://images.tapology.com']")
            .first();

          return {
            name: container.find(".link-primary-red").text().trim(),
            record:
              container
                .find("span.text-\\[15px\\], span.md\\:text-xs")
                .first()
                .text()
                .trim() || null,
            country: flagImg.length ? baseUrl + flagImg.attr("src") : null,
            picture: pictureImg.attr("src") || null,
            link: container.find(".link-primary-red").attr("href")
              ? baseUrl + container.find(".link-primary-red").attr("href")
              : null,
          };
        };

        const fighterA = parseFighter(fighterContainers.eq(0));
        const fighterB = parseFighter(fighterContainers.eq(1));

        if (!fighterA.name || !fighterB.name) return;

        fights.push({
          fighterA,
          fighterB,
          weightClass,
        });
      });

      if (!fights.length) continue;

      results.push({
        ...event,
        organization,
        fullOrganization,
        date,
        venue,
        location,
        fights,
        promotionLinks,
      });

      await delay(2500);
    } catch (err) {
      console.error(`Failed event ${event.link}:`, err.message);
      await delay(8000);
    }
  }

  return results;
};

module.exports = {
  fetchUpcomingEvents,
  fetchEventDetails,
};
