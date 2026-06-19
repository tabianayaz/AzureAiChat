using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace AzureAiChat.Api.Services
{
    public class AzureOpenAIService
    {
        private readonly HttpClient _httpClient;
        private readonly string _endpoint;
        private readonly string _apiKey;
        private readonly string _deploymentName;

        public AzureOpenAIService(IConfiguration configuration)
        {
            _endpoint = configuration["AzureOpenAI:Endpoint"] 
                ?? throw new ArgumentNullException("AzureOpenAI:Endpoint configuration is missing");
            _apiKey = configuration["AzureOpenAI:ApiKey"] 
                ?? throw new ArgumentNullException("AzureOpenAI:ApiKey configuration is missing");
            _deploymentName = configuration["AzureOpenAI:DeploymentName"] 
                ?? "GPT-4.1-mini";

            _httpClient = new HttpClient();
        }

        public async Task<string> GetChatResponseAsync(string systemPrompt, string userPrompt)
        {
            try
            {
                // Detect if using the new OpenAI Responses API endpoint
                bool isResponsesApi = _endpoint.Contains("/responses", StringComparison.OrdinalIgnoreCase);
                string jsonPayload;

                if (isResponsesApi)
                {
                    // Payload format for Responses API (/v1/responses)
                    var payload = new
                    {
                        model = _deploymentName,
                        input = userPrompt,
                        instructions = systemPrompt
                    };
                    jsonPayload = JsonSerializer.Serialize(payload);
                }
                else
                {
                    // Payload format for standard Chat Completions (/chat/completions)
                    var payload = new
                    {
                        model = _deploymentName,
                        messages = new[]
                        {
                            new { role = "system", content = systemPrompt },
                            new { role = "user", content = userPrompt }
                        },
                        temperature = 0.7,
                        max_tokens = 1000
                    };
                    jsonPayload = JsonSerializer.Serialize(payload);
                }

                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint);
                request.Content = content;

                // Attach API key headers (supporting both Azure AI inference and OpenAI header modes)
                request.Headers.Add("api-key", _apiKey);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    throw new HttpRequestException($"Azure OpenAI call failed with status code {response.StatusCode}. Response: {responseContent}");
                }

                using var doc = JsonDocument.Parse(responseContent);
                var root = doc.RootElement;

                if (isResponsesApi)
                {
                    // Parse Responses API response structure: output[0].content[0].text
                    if (root.TryGetProperty("output", out var outputArr) && outputArr.GetArrayLength() > 0)
                    {
                        var firstOutput = outputArr[0];
                        if (firstOutput.TryGetProperty("content", out var contentArr) && contentArr.GetArrayLength() > 0)
                        {
                            if (contentArr[0].TryGetProperty("text", out var textProp))
                            {
                                return textProp.GetString() ?? string.Empty;
                            }
                        }
                    }
                    throw new Exception($"Unexpected Responses API JSON format. Response: {responseContent}");
                }
                else
                {
                    // Parse Chat Completions response structure: choices[0].message.content
                    if (root.TryGetProperty("choices", out var choicesArr) && choicesArr.GetArrayLength() > 0)
                      {
                        var message = choicesArr[0].GetProperty("message");
                        if (message.TryGetProperty("content", out var contentProp))
                        {
                            return contentProp.GetString() ?? string.Empty;
                        }
                    }
                    throw new Exception($"Unexpected Chat Completions API JSON format. Response: {responseContent}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AzureOpenAIService Error]: {ex.Message}");
                throw;
            }
        }
    }
}
