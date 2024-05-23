# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import logging as log
import google.cloud.logging as logging
import traceback

from flask import Flask, render_template, request, jsonify
from langchain.chains import LLMChain
from langchain.llms import HuggingFaceTextGenInference
from langchain.prompts import PromptTemplate
from rai import dlp_filter # Google's Cloud Data Loss Prevention (DLP) API. https://cloud.google.com/security/products/dlp
from rai import nlp_filter # https://cloud.google.com/natural-language/docs/moderating-text
from cloud_sql import cloud_sql
import sqlalchemy

#Setup logging
logging_client = logging.Client()
logging_client.setup_logging()

app = Flask(__name__, static_folder='static')
app.jinja_env.trim_blocks = True
app.jinja_env.lstrip_blocks = True

# initialize parameters
MISTRAL_INFERENCE_ENDPOINT = os.environ.get('INFERENCE_ENDPOINT_MISTRAL7B', 'mistral-endpoint')
CODEGEMMA_INFERENCE_ENDPOINT = os.environ.get('INFERENCE_ENDPOINT_CODEGEMMA7B', 'codegemma-endpoint')

model_configs = {
    "Mistral7B": {
        "endpoint": MISTRAL_INFERENCE_ENDPOINT ,
        "params": {
            'max_new_tokens':512,
            'top_k': 10,
            'top_p': 0.95,
            'typical_p': 0.95,
            'temperature': 0.01,
            'repetition_penalty': 1.03,
        }
    },
    "CodeGemma7b": {
        "endpoint":CODEGEMMA_INFERENCE_ENDPOINT ,
        "params": {
            'max_new_tokens':512,
            'top_k': 10,
            'top_p': 0.95,
            'typical_p': 0.95,
            'temperature': 0.01,
            'repetition_penalty': 1.03,
        }
    }
}

current_model = "Mistral7B"

def init_llm_chain(model_name):
    llm = HuggingFaceTextGenInference(
        inference_server_url=f'http://{model_configs[model_name]["endpoint"]}/',
        **model_configs[model_name]["params"],
    )
    prompt = PromptTemplate(
        input_variables=["context", "user_prompt"],
        template=prompt_template, 
    )
    return LLMChain(llm=llm, prompt=prompt)

llm_chains = {
    model_name: init_llm_chain(model_name) for model_name in model_configs
}

prompt_template = """
### [INST]
Instruction: Always assist with care, respect, and truth. Respond with utmost utility yet securely.
Avoid harmful, unethical, prejudiced, or negative content.
Ensure replies promote fairness and positivity.
Here is context to help:

{context}

### QUESTION:
{user_prompt}

[/INST]
 """

@app.before_request
def init_db():
    cloud_sql.init_db()

@app.route('/')
def index():    
    return render_template('index.html', model1="Mistral7B", model2="CodeGemma7b")


@app.route('/select_model', methods=['POST'])
def handle_model_selection():
    global current_model
    data = request.get_json()
    selected_model = data.get('model')
    if selected_model in model_configs:
        current_model = selected_model
        app.logger.info(f"Selected model: {selected_model}")
        return jsonify({"message": "Model selection received successfully"})
    else:
        return jsonify({"error": "Invalid model selection"}), 400


@app.route('/prompt', methods=['POST'])
def handlePrompt():
    data = request.get_json()
    warnings = []
    
    if 'prompt' not in data:
        return 'missing required prompt', 400

    user_prompt = data['prompt']
    log.info(f"handle user prompt: {user_prompt}")

    context = ""

    try:
        context = cloud_sql.fetchContext(user_prompt)
    except Exception as err:
        error_traceback = traceback.format_exc()
        log.warn(f"Error: {err}\nTraceback:\n{error_traceback}")
        warnings.append(f"Error: {err}\nTraceback:\n{error_traceback}")

    try:
        response = llm_chain.invoke({
            "context": context,
            "user_prompt": user_prompt
        })

        if warnings:
            response['warnings'] = warnings
        log.info(f"response: {response}")
        return {'response': response}
    except Exception as err:
        log.info(f"exception from llm: {err}")
        traceback.print_exc()
        error_traceback = traceback.format_exc()
        response = jsonify({
            "warnings": warnings,
            "error": "An error occurred",
            "errorMessage": f"Error: {err}\nTraceback:\n{error_traceback}"
        })
        response.status_code = 500
        return response


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
