using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using AzureAiChat.Api.Models;
using AzureAiChat.Api.Services;

namespace AzureAiChat.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AssistantController : ControllerBase
    {
        private readonly KnowledgeBaseService _kbService;
        private readonly AzureOpenAIService _openAIService;

        public AssistantController(KnowledgeBaseService kbService, AzureOpenAIService openAIService)
        {
            _kbService = kbService;
            _openAIService = openAIService;
        }

        [HttpPost("ask")]
        public async Task<IActionResult> Ask([FromBody] AskAssistantRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Question))
            {
                return BadRequest(new { message = "Question is required." });
            }

            try
            {
                // 1. Search the local knowledge base
                string context = _kbService.Search(request.Question, topK: 3);

                // 2. Formulate the system prompt with strict instructions
                var systemPrompt = @"You are the Bunkyo University AI Assistant, designed to help new students with questions about the university.

CRITICAL INSTRUCTIONS:
1. You must answer questions using ONLY the provided Knowledge Base context.
2. If the user's question is completely unrelated to Bunkyo University (e.g., general science, cooking, coding, math, general chatting unrelated to the school), you MUST respond politely with EXACTLY this phrase:
   ""I'm the Bunkyo University Assistant and can only answer questions related to the university.""
3. If the question is related to Bunkyo University, but the provided context does not contain enough information to answer the question, or if no context is found, you MUST respond with EXACTLY this phrase:
   ""I couldn't find that information in the university knowledge base.""
4. Do NOT make up any facts or use external knowledge. Rely strictly on the context.
5. Answer in the same language as the user's question (e.g., reply in Japanese if the question is in Japanese, and in English if in English). Use the context to construct your answer, translating the facts accurately if needed.

Context from University Knowledge Base:
" + (string.IsNullOrEmpty(context) ? "[No relevant context found]" : context);

                // 3. Call Azure OpenAI GPT-4.1-mini
                var answer = await _openAIService.GetChatResponseAsync(systemPrompt, request.Question);

                // 4. Clean and return response
                return Ok(new AskAssistantResponse
                {
                    Answer = answer.Trim(),
                    ContextUsed = context
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error in AI Assistant service.", details = ex.Message });
            }
        }
    }
}
