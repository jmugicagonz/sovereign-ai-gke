/* Copyright 2024 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var converter = new showdown.Converter();

document.getElementById("models").addEventListener("change", function (e) {
  const selectedModel = e.target.value;

  fetch("/select_model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: selectedModel }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok.");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("There was a problem with the fetch operation:", error);
    });
});

// Handle the chat form submission
document.getElementById("form").addEventListener("submit", function (e) {
  e.preventDefault();

  var promptInput = document.getElementById("prompt");
  var prompt = promptInput.value;
  if (prompt === "") {
    return;
  }
  promptInput.value = "";

  var chatEl = document.getElementById("chat");
  const userMessageEl = document.createElement("div");
  userMessageEl.classList.add(
    "self-end",
    "flex",
    "items-center",
    "space-x-2",
    "justify-end",
    "mb-4"
  ); // Tailwind classes for positioning and styling
  userMessageEl.innerHTML = `
    <p class="text-end break-all basis-3/4">${prompt}</p>
    <div class="relative w-8 h-8 overflow-hidden bg-gray-100 rounded-full dark:bg-gray-600">
      <svg class="absolute w-10 h-10 text-gray-400 -left-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
      </svg>
    </div>
  `;
  chatEl.appendChild(userMessageEl);

  const botMessageEl = document.createElement("div");
  botMessageEl.classList.add(
    "self-start",
    "flex",
    "items-center",
    "space-x-2",
    "justify-start",
    "mb-4"
  );
  botMessageEl.innerHTML = `
      <img width="20px" height="20px" alt="Model logo" class="inline-block"> 
      <p class="text-start break-words"></p>
    `;
  const imgElement = botMessageEl.querySelector("img");
  imgElement.src = modelIconUrl;
  chatEl.appendChild(botMessageEl);
  chatEl.scrollTop = chatEl.scrollHeight; // Scroll to bottom
  enableForm(false);

  // Collect filter data
  let data = {
    prompt: prompt,
  };

  var body = JSON.stringify(data);

  // Send data to the server
  fetch("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body,
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((errorData) => {
          throw new Error(errorData.errorMessage);
        });
      }
      return response.json();
    })
    .then((data) => {
      var content = data.response.text;
      if (data.response.warnings && data.response.warnings.length > 0) {
        // botMessageEl.classList.replace("response", "warning");
        // content += "\n\nWarning: " + data.response.warnings.join("\n") + "\n";
        console.log("Warning in response: ", data.response.warnings);
      }
      var htmlContent = converter.makeHtml(content); // Convert Markdown to HTML
      botMessageEl.querySelector("p").innerHTML = htmlContent; // Use innerHTML instead of textContent
      // botMessageEl.querySelector("p").textContent = content;
    })
    .catch((err) => {
      // botMessageEl.querySelector("p").textContent = "Error: " + err.message;
      // botMessageEl.classList.add("error-message");
      console.error("Error is response: ", err);
    })
    .finally(() => enableForm(true));
});

function onReady() {
  autoResizeTextarea();
  populateDropdowns();
  updateNLPValue();

  document.getElementById("prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });

  document
    .getElementById("toggle-dlp-filter-section")
    .addEventListener("change", function () {
      fetchDLPEnabled();
      var inspectDropdown = document.getElementById(
        "inspect-template-dropdown"
      );
      var deidentifyDropdown = document.getElementById(
        "deidentify-template-dropdown"
      );

      // Check the Inspect Template Dropdown
      if (inspectDropdown.options.length <= 0) {
        inspectDropdown.style.display = "none"; // Hide Dropdown
        document.getElementById("inspect-template-msg").style.display = "block"; // Show Message
      } else {
        inspectDropdown.style.display = "block"; // Show Dropdown
        document.getElementById("inspect-template-msg").style.display = "none"; // Hide Message
      }

      // Check the De-identify Template Dropdown
      if (deidentifyDropdown.options.length <= 0) {
        deidentifyDropdown.style.display = "none"; // Hide Dropdown
        document.getElementById("deidentify-template-msg").style.display =
          "block"; // Show Message
      } else {
        deidentifyDropdown.style.display = "block"; // Show Dropdown
        document.getElementById("deidentify-template-msg").style.display =
          "none"; // Hide Message
      }
    });

  document
    .getElementById("toggle-nlp-filter-section")
    .addEventListener("change", function () {
      fetchNLPEnabled();
    });
}
if (document.readyState != "loading") onReady();
else document.addEventListener("DOMContentLoaded", onReady);

function enableForm(enabled) {
  var promptEl = document.getElementById("prompt");
  promptEl.toggleAttribute("disabled", !enabled);
  if (enabled) setTimeout(() => promptEl.focus(), 0);

  var submitEl = document.getElementById("submit");
  submitEl.toggleAttribute("disabled", !enabled);
  submitEl.textContent = enabled ? "Submit" : "...";
}
