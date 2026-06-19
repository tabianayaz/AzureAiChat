using System;
using System.ComponentModel.DataAnnotations;

namespace AzureAiChat.Api.Models
{
    public class Message
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string SenderId { get; set; } = string.Empty;

        [Required]
        public string ReceiverId { get; set; } = string.Empty;

        [Required]
        public string MessageText { get; set; } = string.Empty; // Mapped to 'Message' in DB

        [Required]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
