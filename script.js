
let chart;

async function loadData() {

  // Ontario rankings page
  const targetUrl =
    "https://results.ontariospeedskating.ca/rank";

  // Free CORS proxy
  const proxyUrl =
    "https://api.allorigins.win/raw?url=";

  try {

    // Fetch page HTML
    const response = await fetch(
      proxyUrl + encodeURIComponent(targetUrl)
    );

    // Convert to text
    const html = await response.text();

    console.log("HTML Loaded");

    // Parse HTML
    const parser = new DOMParser();

    const doc = parser.parseFromString(
      html,
      "text/html"
    );

    console.log(doc);

    // Find all rows
    const rows =
      doc.querySelectorAll("table tbody tr");

    console.log("Rows Found:", rows.length);

    // Get table body
    const tableBody =
      document.getElementById("tableBody");

    // Clear previous data
    tableBody.innerHTML = "";

    // Arrays for chart
    let labels = [];
    let times = [];

    // Loop through first 10 rows
    rows.forEach((row, index) => {

      if (index < 10) {

        const cols =
          row.querySelectorAll("td");

        // Extract data safely
        const rank =
          cols[0]?.innerText?.trim() || "";

        const name =
          cols[1]?.innerText?.trim() || "";

        const club =
          cols[2]?.innerText?.trim() || "";

        const bestTime =
          cols[3]?.innerText?.trim() || "";

        // Add row to dashboard table
        tableBody.innerHTML += `
          <tr>
            <td>${rank}</td>
            <td>${name}</td>
            <td>${club}</td>
            <td>${bestTime}</td>
          </tr>
        `;

        // Add chart data
        labels.push(name);

        // Convert time to number
        const numericTime =
          parseFloat(bestTime) || 0;

        times.push(numericTime);
      }
    });

    // Create chart
    createChart(labels, times);

  } catch (error) {

    console.error(error);

    alert(
      "Could not load rankings. Press F12 and check Console."
    );
  }
}

function createChart(labels, data) {

  const ctx =
    document.getElementById("chart");

  // Destroy old chart if exists
  if (chart) {
    chart.destroy();
  }

  // Create new chart
  chart = new Chart(ctx, {

    type: "bar",

    data: {

      labels: labels,

      datasets: [{
        label: "Best Time",

        data: data
      }]
    },

    options: {

      responsive: true,

      plugins: {

        legend: {
          display: true
        }
      }
    }
  });
}

