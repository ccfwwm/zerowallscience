// Minimal vanilla-JS client. No framework, no build step.

const $ = (sel) => document.querySelector(sel);

async function uploadPdf(file) {
  const fd = new FormData();
  fd.append("file", file);
  const resp = await fetch("/api/upload", { method: "POST", body: fd });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`upload failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function pollJob(traceId) {
  const resp = await fetch(`/api/jobs/${traceId}`);
  if (!resp.ok) throw new Error(`status ${resp.status}`);
  return resp.json();
}

function showUploadResult(obj) {
  const el = $("#upload-result");
  el.hidden = false;
  el.textContent = JSON.stringify(obj, null, 2);
}

function showPollResult(obj) {
  $("#poll-result").textContent = JSON.stringify(obj, null, 2);
}

function startPolling(traceId) {
  $("#poll").hidden = false;
  const tick = async () => {
    try {
      const job = await pollJob(traceId);
      showPollResult(job);
      if (job.status === "done" || job.status === "failed") {
        if (job.status === "done") {
          $("#report").hidden = false;
          $("#report-link").href = `/api/jobs/${traceId}/report`;
          $("#report-link").textContent =
            `Open report for ${traceId} (new tab)`;
          $("#report-frame").src = `/api/jobs/${traceId}/report`;
        }
        return;
      }
    } catch (err) {
      showPollResult({ error: String(err) });
    }
    setTimeout(tick, 1000);
  };
  tick();
}

$("#upload-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const file = ev.target.elements.file.files[0];
  if (!file) return;
  try {
    const result = await uploadPdf(file);
    showUploadResult(result);
    startPolling(result.trace_id);
  } catch (err) {
    showUploadResult({ error: String(err) });
  }
});
