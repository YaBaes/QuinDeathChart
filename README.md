# Quin's Valheim Death Chart

A static website that plots the `Death Recap` Google Sheet as death number by in-game day. The chart loads the published sheet as CSV when the page opens; use **Refresh data** to fetch the latest rows.

## Run locally

Serve this folder over HTTP (for example, with VS Code Live Server or `python -m http.server 8000`) and open the served page in a browser. Do not open `index.html` directly as a `file://` URL; browsers block the cross-origin sheet request from local files.

The page uses Chart.js from jsDelivr and requires internet access to load both the chart library and public sheet data.

## Deploy to GitHub Pages

The GitHub Actions workflow publishes the static site automatically when changes are pushed to `main`. To enable it, open the repository's **Settings → Pages** and set the build and deployment source to **GitHub Actions**. After enabling it, push a change to `main` or start a deployment from the **Actions** tab with **Deploy to GitHub Pages** → **Run workflow**.

For a project repository, the site URL is `https://<owner>.github.io/<repository>/`. Check the deployment entry in the **Actions** tab for the exact URL. Only `index.html`, `styles.css`, and `app.js` are included in the published artifact.

## Sheet access

The spreadsheet must allow read-only access to anyone with the link. The page reads spreadsheet `1Kp-XEQY5-Lw2FDkZdUjCOWYqyjsIpQHBHRfys5qBF68`: tab ID `0` (`Death Recap`) through Google's CSV export endpoint and the `Notable Events` tab by name through Google's GViz CSV endpoint.

The `Death Recap` tab requires CSV headers `Death`, `Day`, `Enemy`, `Enemy level`, `Situation`, `Location`, and `Clip`. The `Notable Events` tab requires `Event`, `Event Type`, `Day`, and `Clip`. Additional columns are ignored. Use `Boss Kill` as the `Event Type` value for boss defeats; those events keep a visible label on the chart. Other event types, such as `Boss Spawn` and `Setting Change`, are labeled on hover. Both tabs must retain their headers and public read-only access for the chart to load.

## Using the chart

- The page uses the Ocean Sunset palette with a flat Ink Black page background, dark Carbon Black surfaces, Wheat body text, Golden Orange section titles, and a Burnt Caramel main title. The category bars are Dark Teal, enemy variants use Dark Teal/Dark Cyan/Pearl Aqua, and the progression points use red tones.
- Select any number of values in Enemy, Enemy level, Situation, or Location.
- Search within the Enemy, Situation, and Location dropdowns to find values; each search is independent.
- Use **Select all** to select every visible value, or **Select all matching** to select the values shown by a search.
- Values selected within one filter are alternatives; active filters across categories are combined.
- Combined Situation cells are split into individual selectable tags for filtering; a death matches when it has any selected Situation tag. The Situation category chart keeps and counts the original combinations. Clicking a Situation bar filters to that exact combination.
- Matching deaths are highlighted and nonmatching deaths stay visible but dimmed; dimmed points do not show tooltips or respond to clip clicks.
- Hover a highlighted point for its details. Click a highlighted point with a valid Twitch clip to open the clip in a new tab.
- Notable events appear as vertical lines at their in-game day. Hover a line for the event name and clip availability; click it to open a valid Twitch clip. Boss kills are labeled at all times, while other event names appear only in the hover tooltip.
- Enable **Focus on matching days and deaths** to fit both chart axes to matching deaths whenever a filter is active, including filters selected from the category chart.
- Use the category buttons below the progression chart to view death counts by Enemy, Enemy level, Situation, or Location. This chart always counts all deaths and does not follow the line chart filters.
- Categories are ordered by total deaths, highest first. Enemy variants with a trailing parenthesized name are grouped and stacked under their base enemy; hover to see variants and counts in the same top-to-bottom order as the stack, with the hovered variant emphasized in the tooltip. Click an Enemy segment to filter to that exact variant, or click its category name to include every variant. Click a different value to change the filter, click a selected value again to clear it, or click empty chart space to clear all filters. Category bars use Dark Teal, with enemy variants distinguished in a consistent order using Dark Teal, Dark Cyan, and Pearl Aqua. Every category name remains visible on one axis row, with long names wrapped onto two lines; scroll horizontally when needed.
- At the top of the page, the **Recent events** panel shows the latest three deaths and notable events together, ordered by in-game day, regardless of active filters. Death rows show the death number, day, enemy, level, situation, and location; notable-event rows show the event type, day, and event name. Select **Show more** to show the full combined timeline in a scrollable list; select **Show recent only** to return to the latest three. Hover or focus an entry for its details; entries with Twitch clips open them in a new tab. The adjacent **Deaths recorded** card shows the total death count.
- The “Matches your filters” legend appears with the filter controls to identify the highlighted points in the progression chart.
