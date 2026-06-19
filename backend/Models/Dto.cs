using System;

namespace AzureAiChat.Api.Models
{
    public class RegisterRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string PreferredLanguage { get; set; } = "en"; // "en" or "ja"
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string PreferredLanguage { get; set; } = "en"; // "en" or "ja"
    }

    public class AuthResponse
    {
        public string Token { get; set; } = string.Empty;
        public string Id { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PreferredLanguage { get; set; } = "en";
        public string Status { get; set; } = string.Empty;
    }

    public class UserDto
    {
        public string Id { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PreferredLanguage { get; set; } = "en";
        public string Status { get; set; } = string.Empty;
    }

    public class MessageDto
    {
        public int Id { get; set; }
        public string SenderId { get; set; } = string.Empty;
        public string ReceiverId { get; set; } = string.Empty;
        public string MessageText { get; set; } = string.Empty;
        public string TranslatedText { get; set; } = string.Empty; // Populated if auto-translate is on/needed
        public DateTime Timestamp { get; set; }
    }

    public class AskAssistantRequest
    {
        public string Question { get; set; } = string.Empty;
    }

    public class AskAssistantResponse
    {
        public string Answer { get; set; } = string.Empty;
        public string ContextUsed { get; set; } = string.Empty;
    }

    public class ChatRequest
    {
        public string Message { get; set; } = string.Empty;
    }

    public class ChatResponse
    {
        public string Response { get; set; } = string.Empty;
    }
}
