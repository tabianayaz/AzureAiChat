using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using AzureAiChat.Api.Data;
using AzureAiChat.Api.Models;
using AzureAiChat.Api.Services;

namespace AzureAiChat.Api.Hubs
{
    public class ChatHub : Hub
    {
        private readonly ChatDbContext _dbContext;
        private readonly TranslationService _translationService;
        
        // Tracks connected user IDs to their connection counts
        private static readonly ConcurrentDictionary<string, int> UserConnectionsCount = new();

        public ChatHub(ChatDbContext dbContext, TranslationService translationService)
        {
            _dbContext = dbContext;
            _translationService = translationService;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = Context.GetHttpContext()?.Request.Query["userId"].ToString();
            if (!string.IsNullOrEmpty(userId))
            {
                // Assign connection to a group for this user ID
                await Groups.AddToGroupAsync(Context.ConnectionId, userId);

                // Increment connection count
                UserConnectionsCount.AddOrUpdate(userId, 1, (_, current) => current + 1);

                // Update database status
                var user = await _dbContext.Users.FindAsync(userId);
                if (user != null && user.Status != "Online")
                {
                    user.Status = "Online";
                    await _dbContext.SaveChangesAsync();

                    // Broadcast online status change to all other users
                    await Clients.Others.SendAsync("UserStatusChanged", new { userId, status = "Online" });
                }
            }

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var userId = Context.GetHttpContext()?.Request.Query["userId"].ToString();
            if (!string.IsNullOrEmpty(userId))
            {
                if (UserConnectionsCount.TryGetValue(userId, out int count))
                {
                    if (count <= 1)
                    {
                        UserConnectionsCount.TryRemove(userId, out _);

                        // Update database status
                        var user = await _dbContext.Users.FindAsync(userId);
                        if (user != null)
                        {
                            user.Status = "Offline";
                            await _dbContext.SaveChangesAsync();

                            // Broadcast offline status change to all other users
                            await Clients.Others.SendAsync("UserStatusChanged", new { userId, status = "Offline" });
                        }
                    }
                    else
                    {
                        UserConnectionsCount.TryUpdate(userId, count - 1, count);
                    }
                }
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task SendPrivateMessage(string senderId, string receiverId, string messageText)
        {
            if (string.IsNullOrWhiteSpace(messageText)) return;

            var sender = await _dbContext.Users.FindAsync(senderId);
            var receiver = await _dbContext.Users.FindAsync(receiverId);

            if (sender == null || receiver == null) return;

            // Create message entity
            var msg = new Message
            {
                SenderId = senderId,
                ReceiverId = receiverId,
                MessageText = messageText,
                Timestamp = DateTime.UtcNow
            };

            _dbContext.Messages.Add(msg);
            await _dbContext.SaveChangesAsync();

            // Perform translation on-the-fly if sender and receiver have different preferred languages
            string translatedText = string.Empty;
            if (sender.PreferredLanguage != receiver.PreferredLanguage)
            {
                // Translate message text to receiver's preferred language
                translatedText = await _translationService.TranslateAsync(messageText, receiver.PreferredLanguage);
            }

            var messageDto = new MessageDto
            {
                Id = msg.Id,
                SenderId = senderId,
                ReceiverId = receiverId,
                MessageText = messageText,
                TranslatedText = translatedText,
                Timestamp = msg.Timestamp
            };

            // Send message to both receiver and sender groups (handles multiple tabs)
            await Clients.Group(receiverId).SendAsync("ReceiveMessage", messageDto);
            await Clients.Group(senderId).SendAsync("ReceiveMessage", messageDto);
        }
    }
}
