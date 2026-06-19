using System.ComponentModel.DataAnnotations;

namespace AzureAiChat.Api.Models
{
    public class User
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [MaxLength(100)]
        public string Username { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        [MaxLength(256)]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        public string PreferredLanguage { get; set; } = "en"; // "en" or "ja"

        [Required]
        [MaxLength(20)]
        public string Status { get; set; } = "Offline"; // "Online" or "Offline"
    }
}
