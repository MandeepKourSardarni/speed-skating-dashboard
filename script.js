let chart;

async function loadData() {

  const proxy =
    "https://corsproxy.io/?";

  const target =
    "https://results.ontariospeedskating.ca/rank";

  try {

    const response =
      await fetch(proxy + encodeURIComponent(target));

    const html =
      await response.text();

    const parser =
      new DOMParser();

    const doc =
      parser.parseFromString(html, "text/html");

    const rows =
      doc.querySelectorAll("table tbody tr");

    const tableBody =
      document.getElementById("tableBody");

    tableBody.innerHTML = "";

    let labels = [];
    let times = [];

    rows.forEach((row, index) => {

      if(index < 10) {

        const cols = row.querySelectorAll("td");

        const rank =
          cols[0]?.innerText || "";

        const name =
          cols[1]?.innerText || "";

        const club =
          cols[2]?.innerText || "";

        const bestTime =
          cols[3]?.innerText || "";

        tableBody.innerHTML += `
          <tr>
            <td>${rank}</td>
            <td>${name}</td>
            <td>${club}</td>
            <td>${bestTime}</td>
          </tr>
        `;

        labels.push(name);

        times.push(
          parseFloat(bestTime) || 0
        );
      }
    });

    createChart(labels, times);

  } catch(error) {

    alert("Could not load rankings");

    console.log(error);
  }
}

function createChart(labels, data) {

  const ctx =
    document.getElementById("chart");

  if(chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {

    type: "bar",

    data: {

      labels: labels,

      datasets: [{
        label: "Best Times",

        data: data
      }]
    }
  });
}
