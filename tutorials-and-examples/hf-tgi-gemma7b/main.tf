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

locals {
  additional_labels = tomap({
    for item in split(",", var.additional_labels) :
    split("=", item)[0] => split("=", item)[1]
  })
}

resource "kubernetes_service" "inference_service" {
  metadata {
    name = "gemma-7b-service"
    labels = {
      app = "gemma-7b"
    }
    namespace = var.namespace
    annotations = {
      "cloud.google.com/load-balancer-type" = "Internal"
      "cloud.google.com/neg"                = "{\"ingress\":true}"
    }
  }
  spec {
    selector = {
      app = "gemma-7b"
    }
    session_affinity = "ClientIP"
    port {
      protocol    = "TCP"
      port        = 80
      target_port = 8080
    }

    type = "LoadBalancer"
  }
}

resource "kubernetes_deployment" "inference_deployment" {
  timeouts {
    create = "30m"
  }
  metadata {
    name      = "gemma-7b"
    namespace = var.namespace
    labels = merge({
      app = "gemma-7b"
    }, local.additional_labels)
  }

  spec {
    # It takes more than 10m for the deployment to be ready on Autopilot cluster
    # Set the progress deadline to 30m to avoid the deployment controller
    # considering the deployment to be failed
    progress_deadline_seconds = 1800
    replicas                  = 1

    selector {
      match_labels = merge({
        app = "gemma-7b"
      }, local.additional_labels)
    }

    template {
      metadata {
        labels = merge({
          app = "gemma-7b"
        }, local.additional_labels)
      }

      spec {
        container {
          image = "ghcr.io/huggingface/text-generation-inference:2.0.2"
          name  = "gemma-7b"

          port {
            name           = "metrics"
            container_port = 8080
            protocol       = "TCP"
          }

          args = ["--model-id", "google/gemma-7b"]

          env {
            name  = "NUM_SHARD"
            value = "2"
          }

          env {
            name  = "PORT"
            value = "8080"
          }

          env {
            name  = "HUGGING_FACE_HUB_TOKEN"
            value = var.huggingface_token
          }

          resources {
            limits = {
              "cpu": "12"
              "memory": "25Gi"
              "ephemeral-storage": "40Gi"
              "nvidia.com/gpu" : "2"
            }
            requests = {
              # Sufficient storage to fit the Gemma7b model
              "cpu": "10"
              "memory": "25Gi"
              "ephemeral-storage": "40Gi"
              "nvidia.com/gpu" : "2"
            }
          }

          volume_mount {
            mount_path = "/dev/shm"
            name       = "dshm"
          }

          volume_mount {
            mount_path = "/data"
            name       = "data"
          }

          #liveness_probe {
          #http_get {
          #path = "/"
          #port = 8080

          #http_header {
          #name  = "X-Custom-Header"
          #value = "Awesome"
          #}
          #}

          #initial_delay_seconds = 3
          #period_seconds        = 3
          #}
        }

        volume {
          name = "dshm"
          empty_dir {
            medium = "Memory"
          }
        }

        volume {
          name = "data"
          empty_dir {}
        }

        node_selector = merge({
          "cloud.google.com/gke-accelerator" = "nvidia-l4"
          }, var.autopilot_cluster ? {
          "cloud.google.com/gke-ephemeral-storage-local-ssd" = "true"
          "cloud.google.com/compute-class"                   = "Accelerator"
        } : {})
      }
    }
  }
}
