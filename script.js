const PAGE_SIZE = 10;
let records = [];
let filteredRecords = [];
let currentPage = 1;

const ids = [
  "titleFilter",
  "authorFilter",
  "subjectFilter",
  "regionFilter",
  "startYearFilter",
  "endYearFilter"
];

const elements = Object.fromEntries(
  ids.map(id => [id, document.getElementById(id)])
);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";

      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows
    .shift()
    .map(header => header.replace(/^\uFEFF/, "").trim());

  return rows.map(values =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    )
  );
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitOptions(value) {
  return String(value ?? "")
    .split("|")
    .map(option => option.trim())
    .filter(Boolean);
}

function yearFrom(value) {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

function matchesAny(values, query) {
  if (!query) return true;

  return values.some(value =>
    splitOptions(value).some(option =>
      normalize(option).includes(normalize(query))
    )
  );
}

function applyFilters() {
  const title = elements.titleFilter.value;
  const author = elements.authorFilter.value;
  const subject = elements.subjectFilter.value;
  const region = elements.regionFilter.value;

  const startValue = elements.startYearFilter.value.trim();
  const endValue = elements.endYearFilter.value.trim();
  const start = startValue === "" ? null : Number(startValue);
  const end = endValue === "" ? null : Number(endValue);

  filteredRecords = records.filter(record => {
    const recordStart =
      yearFrom(record.DateDébut) ?? yearFrom(record.Date);

    const recordEnd =
      yearFrom(record.DateFin) ??
      yearFrom(record.Date) ??
      recordStart;

    return (
      matchesAny([record.Titre, record["Titre Article"]], title) &&
      matchesAny([record.Auteurs, record["Auteurs collectifs"]], author) &&
      matchesAny([record.Sujets], subject) &&
      (!region ||
        splitOptions(record["Régions"]).some(
          value => normalize(value) === normalize(region)
        )) &&
      (!start || (recordEnd !== null && recordEnd >= start)) &&
      (!end || (recordStart !== null && recordStart <= end))
    );
  });

  currentPage = 1;
  render();
}

function addDetail(dl, label, value) {
  if (!value) return;

  const dt = document.createElement("dt");
  dt.textContent = label;

  const dd = document.createElement("dd");
  dd.textContent = splitOptions(value).join("; ");

  dl.append(dt, dd);
}

function runLinkedSearch(filterElement, value) {
  filterElement.value = value;
  applyFilters();

  const heading = document.getElementById("resultsHeading");
  if (heading) {
    heading.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function addClickableAuthors(dl, label, value) {
  if (!value) return;

  const dt = document.createElement("dt");
  dt.textContent = label;

  const dd = document.createElement("dd");
  dd.className = "author-list";

  splitOptions(value).forEach(author => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "author-link";
    button.textContent = author;
    button.title = `Afficher toutes les notices de « ${author} »`;
    button.setAttribute("aria-label", `Rechercher l’auteur ${author}`);

    button.addEventListener("click", () => {
      runLinkedSearch(elements.authorFilter, author);
    });

    dd.appendChild(button);
  });

  dl.append(dt, dd);
}

function renderRecords() {
  const container = document.getElementById("results");
  container.innerHTML = "";

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRecords = filteredRecords.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  if (!pageRecords.length) {
    container.innerHTML =
      '<p class="empty">Aucune notice ne correspond à ces critères.</p>';
    return;
  }

  const template = document.getElementById("recordTemplate");

  pageRecords.forEach(record => {
    const card = template.content.cloneNode(true);

    card.querySelector(".record-number").textContent =
      record["Numéro notice"]
        ? `Notice ${record["Numéro notice"]}`
        : "";

    const articleTitle = record["Titre Article"];
    const containerTitle = record.Titre;

    card.querySelector(".record-title").textContent =
      articleTitle || containerTitle || "Sans titre";

    const dl = card.querySelector(".record-details");

    addClickableAuthors(dl, "Auteur", record.Auteurs);
    addClickableAuthors(
      dl,
      "Auteur collectif",
      record["Auteurs collectifs"]
    );

    if (articleTitle && containerTitle) {
      addDetail(dl, "Titre", containerTitle);
    }

    addDetail(dl, "Collection", record.Collection);
    addDetail(dl, "Date", record.Date);
    addDetail(
      dl,
      "Volume / numéro",
      [
        record.Volume && `vol. ${record.Volume}`,
        record["Numéro"] && `no ${record["Numéro"]}`
      ]
        .filter(Boolean)
        .join(", ")
    );
    addDetail(dl, "Édition", record["Édition"]);
    addDetail(dl, "Collation", record.Collation);
    addDetail(dl, "Éditeur", record["Éditeur"]);
    addDetail(dl, "Lieu", record.Lieu);
    addDetail(dl, "Notes", record.Notes);

    const regionList = card.querySelector(".region-list");

    splitOptions(record["Régions"]).forEach(region => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "region-tag";
      tag.textContent = region;
      tag.title =
        `Afficher toutes les notices de la région « ${region} »`;
      tag.setAttribute(
        "aria-label",
        `Rechercher la région ${region}`
      );

      tag.addEventListener("click", () => {
        runLinkedSearch(elements.regionFilter, region);
      });

      regionList.appendChild(tag);
    });

    const subjectList = card.querySelector(".subject-list");

    splitOptions(record.Sujets).forEach(subject => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "subject-tag";
      tag.textContent = subject;
      tag.title =
        `Afficher toutes les notices ayant le sujet « ${subject} »`;
      tag.setAttribute(
        "aria-label",
        `Rechercher le sujet ${subject}`
      );

      tag.addEventListener("click", () => {
        runLinkedSearch(elements.subjectFilter, subject);
      });

      subjectList.appendChild(tag);
    });

    container.appendChild(card);
  });
}

function renderPagination() {
  const nav = document.getElementById("pagination");
  nav.innerHTML = "";

  const pages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  if (pages <= 1) return;

  const makeButton = (
    label,
    page,
    disabled = false,
    current = false
  ) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.disabled = disabled;

    if (current) button.setAttribute("aria-current", "page");

    button.addEventListener("click", () => {
      currentPage = page;
      render();

      window.scrollTo({
        top: document.getElementById("results").offsetTop - 20,
        behavior: "smooth"
      });
    });

    return button;
  };

  nav.appendChild(
    makeButton("Précédent", currentPage - 1, currentPage === 1)
  );

  const visiblePages = new Set([1, pages]);

  for (
    let page = Math.max(1, currentPage - 2);
    page <= Math.min(pages, currentPage + 2);
    page++
  ) {
    visiblePages.add(page);
  }

  let previousPage = 0;

  [...visiblePages]
    .sort((a, b) => a - b)
    .forEach(page => {
      if (previousPage && page > previousPage + 1) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "pagination-ellipsis";
        ellipsis.textContent = "…";
        nav.appendChild(ellipsis);
      }

      nav.appendChild(
        makeButton(
          String(page),
          page,
          false,
          page === currentPage
        )
      );

      previousPage = page;
    });

  nav.appendChild(
    makeButton("Suivant", currentPage + 1, currentPage === pages)
  );
}

function render() {
  document.getElementById("resultCount").textContent =
    `${filteredRecords.length} notice` +
    `${filteredRecords.length === 1 ? "" : "s"}`;

  renderRecords();
  renderPagination();
}

async function init() {
  try {
    const response = await fetch("data.csv", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    records = parseCSV(await response.text());
    filteredRecords = [...records];

    const regions = [
      ...new Set(
        records
          .flatMap(record => splitOptions(record["Régions"]))
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "fr"));

    regions.forEach(region => {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = region;
      elements.regionFilter.appendChild(option);
    });

    document
      .getElementById("searchButton")
      .addEventListener("click", applyFilters);

    ids.forEach(id => {
      elements[id].addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyFilters();
        }
      });
    });

    document
      .getElementById("resetButton")
      .addEventListener("click", () => {
        ids.forEach(id => {
          elements[id].value = "";
        });

        applyFilters();
      });

    render();
  } catch (error) {
    console.error(error);

    document.getElementById("results").innerHTML =
      '<p class="empty">Impossible de charger les données du catalogue.</p>';

    document.getElementById("resultCount").textContent =
      "Erreur de chargement";
  }
}

init();
