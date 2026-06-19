using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AzureAiChat.Api.Data;
using AzureAiChat.Api.Models;
using AzureAiChat.Api.Services;

namespace AzureAiChat.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly ChatDbContext _dbContext;
        private readonly AzureOpenAIService _openAIService;
        private readonly TranslationService _translationService;

        public ChatController(ChatDbContext dbContext, AzureOpenAIService openAIService, TranslationService translationService)
        {
            _dbContext = dbContext;
            _openAIService = openAIService;
            _translationService = translationService;
        }

        // Endpoint: POST /api/chat
        // Accepts user message, sends to Azure OpenAI, returns response as JSON
        [HttpPost]
        public async Task<IActionResult> PostChat([FromBody] ChatRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest(new { message = "Message content is required." });
            }

            try
            {
                var systemPrompt = "You are a helpful, friendly, and professional AI Assistant. Answer the user's query clearly and concisely.";
                var response = await _openAIService.GetChatResponseAsync(systemPrompt, request.Message);
                return Ok(new ChatResponse { Response = response });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error communicating with Azure OpenAI.", details = ex.Message });
            }
        }

        // Endpoint: GET /api/chat/users
        // Retrieves all users and their online statuses
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers([FromQuery] string excludeUserId)
        {
            var query = _dbContext.Users.AsQueryable();
            if (!string.IsNullOrEmpty(excludeUserId))
            {
                query = query.Where(u => u.Id != excludeUserId);
            }

            var users = await query
                .Select(u => new UserDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    Email = u.Email,
                    PreferredLanguage = u.PreferredLanguage,
                    Status = u.Status
                })
                .ToListAsync();

            return Ok(users);
        }

        // Endpoint: GET /api/chat/messages
        // Retrieves chat history between sender and receiver
        [HttpGet("messages")]
        public async Task<IActionResult> GetMessages([FromQuery] string senderId, [FromQuery] string receiverId, [FromQuery] bool autoTranslate = false)
        {
            if (string.IsNullOrEmpty(senderId) || string.IsNullOrEmpty(receiverId))
            {
                return BadRequest(new { message = "senderId and receiverId are required." });
            }

            var messages = await _dbContext.Messages
                .Where(m => (m.SenderId == senderId && m.ReceiverId == receiverId) || 
                            (m.SenderId == receiverId && m.ReceiverId == senderId))
                .OrderBy(m => m.Timestamp)
                .ToListAsync();

            var sender = await _dbContext.Users.FindAsync(senderId);
            var receiver = await _dbContext.Users.FindAsync(receiverId);

            if (sender == null || receiver == null)
            {
                return NotFound(new { message = "Sender or Receiver not found." });
            }

            var dtos = new System.Collections.Generic.List<MessageDto>();

            foreach (var m in messages)
            {
                string translatedText = string.Empty;
                
                // If autoTranslate is ON and languages differ, translate the message text
                if (autoTranslate)
                {
                    // If the current message was sent by someone else, translate it to the viewer's language
                    var viewerLanguage = senderId == m.ReceiverId ? sender.PreferredLanguage : receiver.PreferredLanguage;
                    var author = m.SenderId == senderId ? sender : receiver;

                    if (author.PreferredLanguage != viewerLanguage)
                    {
                        translatedText = await _translationService.TranslateAsync(m.MessageText, viewerLanguage);
                    }
                }

                dtos.Add(new MessageDto
                {
                    Id = m.Id,
                    SenderId = m.SenderId,
                    ReceiverId = m.ReceiverId,
                    MessageText = m.MessageText,
                    TranslatedText = translatedText,
                    Timestamp = m.Timestamp
                });
            }

            return Ok(dtos);
        }
    }
}
