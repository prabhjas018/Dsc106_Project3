const mapWidth = 900;
const mapHeight = 650;

let wildfireData = [];
let currentIndex = 20;
let currentLayer = "MODIS_Terra_CorrectedReflectance_TrueColor";
let currentTransform = d3.zoomIdentity;

const map = d3.select("#map");
const tooltip = d3.select("#tooltip");

const tileLayer = map
  .append("div")
  .attr("id", "tileLayer")
  .style("position", "absolute")
  .style("width", `${mapWidth}px`)
  .style("height", `${mapHeight}px`)
  .style("transform-origin", "0 0");

const svg = map
  .append("svg")
  .attr("width", mapWidth)
  .attr("height", mapHeight);

svg.append("rect")
  .attr("width", mapWidth)
  .attr("height", mapHeight)
  .style("fill", "none")
  .style("pointer-events", "all");

const fireLayer = svg.append("g").attr("id", "fireLayer");

const projection = d3
  .geoMercator()
  .center([-119.5, 37.2])
  .scale(2600)
  .translate([mapWidth / 2, mapHeight / 2]);

const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", event => {
    currentTransform = event.transform;

    tileLayer.style(
      "transform",
      `translate(${currentTransform.x}px, ${currentTransform.y}px) scale(${currentTransform.k})`
    );

    fireLayer.selectAll(".fire-dot")
      .attr("cx", d => currentTransform.applyX(d.x))
      .attr("cy", d => currentTransform.applyY(d.y));
  });

svg.call(zoom);

function getCurrentRow() {
  return wildfireData[currentIndex];
}

function gibsTileUrl(layer, date, z, x, y) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
}

function renderTiles() {
  const row = getCurrentRow();
  if (!row) return;

  const date = row.peak_date || row.date;
  const z = 6;

  const tiles = [];
  for (let x = 9; x <= 12; x++) {
    for (let y = 22; y <= 26; y++) {
      tiles.push({ x, y, z });
    }
  }

  const images = tileLayer
    .selectAll("img")
    .data(tiles, d => `${d.z}-${d.x}-${d.y}`);

  images.exit().remove();

  images
    .enter()
    .append("img")
    .attr("class", "tile")
    .merge(images)
    .attr("src", d => gibsTileUrl(currentLayer, date, d.z, d.x, d.y))
    .style("width", "256px")
    .style("height", "256px")
    .style("left", d => `${(d.x - 9) * 256}px`)
    .style("top", d => `${(d.y - 22) * 256}px`)
    .on("error", function (event, d) {
      const backupLayer = currentLayer.includes("Terra")
        ? currentLayer.replace("Terra", "Aqua")
        : currentLayer.replace("Aqua", "Terra");
      d3.select(this).attr("src", gibsTileUrl(backupLayer, date, d.z, d.x, d.y));
    });
}

function renderFireDots() {
  const row = getCurrentRow();
  if (!row) return;

  fireLayer.selectAll("*").remove();

  const maxDetections = d3.max(wildfireData, d => d.detections);
  const maxFRP = d3.max(wildfireData, d => d.total_frp);
  const radiusScale = d3.scaleSqrt().domain([0, maxDetections]).range([5, 22]);
  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxFRP]);

  // ── All other years: faded grey dots, clickable ──────────────────────────
  wildfireData.forEach((d, i) => {
    if (i === currentIndex) return;
    if (!d.peak_lon || !d.peak_lat) return;

    const [x, y] = projection([d.peak_lon, d.peak_lat]);
    const r = radiusScale(d.detections) * 0.5;

    fireLayer
      .append("circle")
      .datum({ x, y })
      .attr("class", "fire-dot history-dot")
      .attr("cx", currentTransform.applyX(x))
      .attr("cy", currentTransform.applyY(y))
      .attr("r", r)
      .style("fill", "#cccccc")
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.8)
      .style("opacity", 0.4)
      .style("cursor", "pointer")
      .on("mouseenter", (event) => {
        d3.select(event.currentTarget).style("opacity", 0.85);
        tooltip.style("opacity", 1).html(`
          <strong style="color:#555;">${d.year}</strong><br>
          <strong>Detections:</strong> ${d3.format(",")(d.detections)}<br>
          <strong>Total FRP:</strong> ${d3.format(",.0f")(d.total_frp)} MW<br>
          <em style="font-size:0.8em;color:#888;">Click to jump to this year</em>
        `);
      })
      .on("mousemove", event => {
        tooltip
          .style("left", `${event.pageX + 14}px`)
          .style("top", `${event.pageY + 14}px`);
      })
      .on("mouseleave", (event) => {
        d3.select(event.currentTarget).style("opacity", 0.4);
        tooltip.style("opacity", 0);
      })
      .on("click", () => {
        currentIndex = i;
        d3.select("#yearSlider").property("value", i);
        updateAll();
      });
  });

  // ── Selected year: prominent, colored, pulsing ───────────────────────────
  const lon = row.peak_lon || -119.5;
  const lat = row.peak_lat || 37.2;
  const [x, y] = projection([lon, lat]);
  const r = radiusScale(row.detections);

  const circle = fireLayer
    .append("circle")
    .datum({ x, y, baseRadius: r })
    .attr("class", "fire-dot")
    .attr("cx", currentTransform.applyX(x))
    .attr("cy", currentTransform.applyY(y))
    .attr("r", r)
    .style("fill", colorScale(row.total_frp))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2.5)
    .style("cursor", "pointer")
    .style("opacity", 0.92);

  circle
    .on("mouseenter", (event) => {
      d3.select(event.currentTarget)
        .attr("stroke", "#000000")
        .attr("stroke-width", 4);
      tooltip.style("opacity", 1).html(`
        <strong style="font-size:1em;color:#d93101;">Peak Activity: ${row.year}</strong><br>
        <strong>Centroid:</strong> ${row.peak_lat.toFixed(2)}&deg;N, ${Math.abs(row.peak_lon).toFixed(2)}&deg;W<br>
        <strong>Peak Date:</strong> ${row.peak_date}<br>
        <strong>MODIS Detections:</strong> ${d3.format(",")(row.detections)}<br>
        <strong>Total FRP:</strong> ${d3.format(",.0f")(row.total_frp)} MW<br>
        <strong>Peak-day detections:</strong> ${d3.format(",")(row.peak_day_detections)}
      `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`);
    })
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2.5);
      tooltip.style("opacity", 0);
    });

  (function pulse() {
    circle.transition("pulse")
      .duration(1000)
      .attr("r", r * 1.8)
      .attr("opacity", 0.4)
      .transition()
      .duration(1000)
      .attr("r", r)
      .attr("opacity", 0.92)
      .on("end", pulse);
  })();

  renderLegend(colorScale, radiusScale, maxFRP, maxDetections);
}

function renderLegend(colorScale, radiusScale, maxFRP, maxDetections) {
  d3.select("#legendContent").html("");

  const legendSvg = d3.select("#legendContent")
    .append("svg")
    .attr("width", 170)
    .attr("height", 130);

  // FRP color scale label
  legendSvg.append("text")
    .attr("x", 0).attr("y", 13)
    .style("font-size", "0.72rem").style("fill", "#444")
    .style("font-family", "system-ui, sans-serif")
    .text("FRP intensity (selected year)");

  const defs = legendSvg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "frpGrad");
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(t * maxFRP));
  });

  legendSvg.append("rect")
    .attr("x", 0).attr("y", 20).attr("width", 130).attr("height", 12)
    .attr("rx", 3).style("fill", "url(#frpGrad)");

  legendSvg.append("text").attr("x", 0).attr("y", 46)
    .style("font-size", "0.68rem").style("fill", "#666")
    .style("font-family", "system-ui, sans-serif").text("Low");

  legendSvg.append("text").attr("x", 130).attr("y", 46)
    .attr("text-anchor", "end")
    .style("font-size", "0.68rem").style("fill", "#666")
    .style("font-family", "system-ui, sans-serif").text("High");

  // Size note
  legendSvg.append("text")
    .attr("x", 0).attr("y", 68)
    .style("font-size", "0.72rem").style("fill", "#444")
    .style("font-family", "system-ui, sans-serif")
    .text("Size = detection count");

  // Grey dot key
  legendSvg.append("circle")
    .attr("cx", 8).attr("cy", 92).attr("r", 6)
    .style("fill", "#ccc").attr("stroke", "#fff").attr("stroke-width", 1)
    .style("opacity", 0.5);

  legendSvg.append("text")
    .attr("x", 20).attr("y", 96)
    .style("font-size", "0.71rem").style("fill", "#555")
    .style("font-family", "system-ui, sans-serif")
    .text("Other years (click to select)");
}

function renderInfoPanel() {
  const d = getCurrentRow();
  if (!d) return;

  d3.select("#panelYear").text(d.year);

  d3.select("#panelDate").html(`
    <strong>Satellite date shown:</strong> ${d.peak_date || d.date}<br>
    <strong>Layer:</strong> ${getLayerLabel(currentLayer)}
  `);

  d3.select("#panelStats").html(`
    <strong>MODIS detections:</strong> ${d3.format(",")(d.detections)}<br>
    <strong>Total FRP:</strong> ${d3.format(",.0f")(d.total_frp)} MW<br>
    <strong>Peak-day detections:</strong> ${d3.format(",")(d.peak_day_detections)}
  `);

  d3.select("#panelNote").html(`
    Peak detection date: ${d.peak_date}. FIRMS recorded
    ${d3.format(",")(d.detections)} MODIS active-fire detections in California this year.
    The colored dot marks the mean centroid of all detections; grey dots show all other years for spatial comparison.
  `);
}

function getLayerLabel(layer) {
  if (layer.includes("Aqua") && layer.includes("Bands721")) return "Aqua False Color";
  if (layer.includes("Terra") && layer.includes("Bands721")) return "Terra False Color";
  if (layer.includes("Aqua")) return "Aqua True Color";
  return "Terra True Color";
}

function renderBarChart() {
  const svg = d3.select("#barChart");
  svg.selectAll("*").remove();

  const width = 1050;
  const height = 330;
  const margin = { top: 40, right: 30, bottom: 70, left: 85 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(wildfireData.map(d => d.year))
    .range([0, innerWidth])
    .padding(0.15);

  const y = d3.scaleLinear()
    .domain([0, d3.max(wildfireData, d => d.detections)])
    .nice()
    .range([innerHeight, 0]);

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  g.append("g")
    .call(d3.axisLeft(y).tickFormat(d3.format(".2s")));

  g.append("text")
    .attr("x", 0).attr("y", -14)
    .attr("font-weight", "800").attr("font-size", "1rem")
    .text("California MODIS active-fire detections by year");

  g.append("text")
    .attr("class", "axis-label")
    .attr("x", innerWidth / 2).attr("y", innerHeight + 58)
    .attr("text-anchor", "middle").text("Year");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2).attr("y", -58)
    .attr("text-anchor", "middle").text("Active-fire detections");

  g.selectAll("rect")
    .data(wildfireData)
    .join("rect")
    .attr("class", "bar")
    .attr("x", d => x(d.year))
    .attr("y", d => y(d.detections))
    .attr("width", x.bandwidth())
    .attr("height", d => innerHeight - y(d.detections))
    .attr("fill", (d, i) => i === currentIndex ? "#d94801" : "#aaa")
    .on("mouseover", (event, d) => {
      tooltip.style("opacity", 1).html(`
        <strong>${d.year}</strong><br>
        Detections: ${d3.format(",")(d.detections)}<br>
        Peak date: ${d.peak_date}<br>
        Total FRP: ${d3.format(",.0f")(d.total_frp)} MW
      `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`);
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    .on("click", (event, d) => {
      currentIndex = wildfireData.findIndex(row => row.year === d.year);
      d3.select("#yearSlider").property("value", currentIndex);
      updateAll();
    });
}

function updateAll() {
  const row = getCurrentRow();
  if (!row) return;

  d3.select("#yearLabel").text(row.year);
  renderTiles();
  renderFireDots();
  renderInfoPanel();
  renderBarChart();
}

function resetMap() {
  currentTransform = d3.zoomIdentity;
  svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  tileLayer.style("transform", "translate(0px, 0px) scale(1)");
}

d3.csv("data/wildfire_years_summary.csv", d => ({
  year: +d.year,
  detections: +d.detections,
  total_frp: +d.total_frp,
  peak_date: d.date,
  peak_day_detections: +d.day_detections,
  peak_lat: +d.mean_lat,
  peak_lon: +d.mean_lon,
  date: d.date
})).then(data => {
  wildfireData = data.sort((a, b) => a.year - b.year);

  currentIndex = wildfireData.findIndex(d => d.year === 2020);
  if (currentIndex < 0) currentIndex = 0;

  d3.select("#yearSlider")
    .attr("min", 0)
    .attr("max", wildfireData.length - 1)
    .property("value", currentIndex)
    .on("input", event => {
      currentIndex = +event.target.value;
      updateAll();
    });

  d3.select("#layerSelect").on("change", event => {
    currentLayer = event.target.value;
    updateAll();
  });

  d3.select("#resetMap").on("click", resetMap);

  updateAll();
});
