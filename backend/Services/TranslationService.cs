using System;
using System.Threading.Tasks;

namespace AzureAiChat.Api.Services
{
    public class TranslationService
    {
        private readonly AzureOpenAIService _openAIService;

        public TranslationService(AzureOpenAIService openAIService)
        {
            _openAIService = openAIService;
        }

        public async Task<string> TranslateAsync(string text, string targetLanguageCode)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;

            string targetLanguageName = targetLanguageCode.ToLower() switch
            {
                "ja" => "Japanese",
                "en" => "English",
                _ => "English"
            };

            var systemPrompt = $@"You are a professional translator. 
Translate the user's message into {targetLanguageName}.
If the text is already in {targetLanguageName}, or if it consists of content that shouldn't be translated (e.g. names, codes, or greetings already understood), return the original text exactly as-is.
Return ONLY the translation (or the original text, if no translation is needed). 
Do NOT include any extra explanations, greetings, quotes, or formatting.";

            try
            {
                var translated = await _openAIService.GetChatResponseAsync(systemPrompt, text);
                return translated.Trim();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TranslationService Error]: {ex.Message}");
                // Fallback to original text on failure
                return text;
            }
        }
    }
}
