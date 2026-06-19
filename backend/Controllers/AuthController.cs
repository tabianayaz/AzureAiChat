using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using AzureAiChat.Api.Data;
using AzureAiChat.Api.Models;

namespace AzureAiChat.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ChatDbContext _dbContext;
        private readonly IConfiguration _configuration;

        public AuthController(ChatDbContext dbContext, IConfiguration configuration)
        {
            _dbContext = dbContext;
            _configuration = configuration;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password) || string.IsNullOrWhiteSpace(request.Username))
            {
                return BadRequest(new { message = "Username, Email, and Password are required." });
            }

            var existingUser = await _dbContext.Users.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower());
            if (existingUser)
            {
                return BadRequest(new { message = "Email is already registered." });
            }

            var user = new User
            {
                Username = request.Username,
                Email = request.Email,
                PasswordHash = HashPassword(request.Password),
                PreferredLanguage = request.PreferredLanguage.ToLower() == "ja" ? "ja" : "en",
                Status = "Offline"
            };

            _dbContext.Users.Add(user);
            await _dbContext.SaveChangesAsync();

            var token = GenerateJwtToken(user);

            return Ok(new AuthResponse
            {
                Token = token,
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                PreferredLanguage = user.PreferredLanguage,
                Status = user.Status
            });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { message = "Email and Password are required." });
            }

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
            if (user == null || user.PasswordHash != HashPassword(request.Password))
            {
                return Unauthorized(new { message = "Invalid email or password." });
            }

            // Save preferred language selected on login
            user.PreferredLanguage = request.PreferredLanguage.ToLower() == "ja" ? "ja" : "en";
            await _dbContext.SaveChangesAsync();

            var token = GenerateJwtToken(user);

            return Ok(new AuthResponse
            {
                Token = token,
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                PreferredLanguage = user.PreferredLanguage,
                Status = user.Status
            });
        }

        [HttpPost("logout/{userId}")]
        public async Task<IActionResult> Logout(string userId)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user != null)
            {
                user.Status = "Offline";
                await _dbContext.SaveChangesAsync();
            }
            return Ok();
        }

        [HttpPut("settings/{userId}")]
        public async Task<IActionResult> UpdateSettings(string userId, [FromBody] UpdateSettingsRequest request)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound(new { message = "User not found." });
            }

            if (!string.IsNullOrEmpty(request.PreferredLanguage))
            {
                user.PreferredLanguage = request.PreferredLanguage.ToLower() == "ja" ? "ja" : "en";
            }

            await _dbContext.SaveChangesAsync();
            return Ok(new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                PreferredLanguage = user.PreferredLanguage,
                Status = user.Status
            });
        }

        private string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
            return Convert.ToBase64String(hashedBytes);
        }

        private string GenerateJwtToken(User user)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var secret = _configuration["JwtSettings:Secret"] ?? "SuperSecretKeyForAzureAiChatApp2026!";
            var key = Encoding.ASCII.GetBytes(secret);

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id),
                    new Claim(ClaimTypes.Name, user.Username),
                    new Claim(ClaimTypes.Email, user.Email)
                }),
                Expires = DateTime.UtcNow.AddMinutes(double.Parse(_configuration["JwtSettings:ExpiryInMinutes"] ?? "1440")),
                Issuer = _configuration["JwtSettings:Issuer"] ?? "AzureAiChatBackend",
                Audience = _configuration["JwtSettings:Audience"] ?? "AzureAiChatFrontend",
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }
    }

    public class UpdateSettingsRequest
    {
        public string PreferredLanguage { get; set; } = string.Empty;
    }
}
