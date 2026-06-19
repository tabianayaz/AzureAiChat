using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace AzureAiChat.Api.Services
{
    public class KnowledgeBaseService
    {
        private readonly string _kbDirectory;
        private List<KbChunk> _chunks = new();

        public class KbChunk
        {
            public string SourceFile { get; set; } = string.Empty;
            public string Content { get; set; } = string.Empty;
            public string Header { get; set; } = string.Empty;
            public List<string> Tokens { get; set; } = new();
        }

        public KnowledgeBaseService()
        {
            // Default to looking for knowledge_base in the parent directory or relative to app root
            var baseDir = AppContext.BaseDirectory;
            
            // Try to locate the knowledge_base folder by climbing up directories if needed
            var kbPath = Path.Combine(baseDir, "knowledge_base");
            if (!Directory.Exists(kbPath))
            {
                // Go up to project folder
                var directoryInfo = new DirectoryInfo(baseDir);
                while (directoryInfo != null && !Directory.Exists(Path.Combine(directoryInfo.FullName, "knowledge_base")))
                {
                    directoryInfo = directoryInfo.Parent;
                }
                if (directoryInfo != null)
                {
                    kbPath = Path.Combine(directoryInfo.FullName, "knowledge_base");
                }
                else
                {
                    // Default fallback
                    kbPath = @"C:\Users\user\.gemini\antigravity\scratch\AzureAiChat\knowledge_base";
                }
            }

            _kbDirectory = kbPath;
            LoadKnowledgeBase();
        }

        public void LoadKnowledgeBase()
        {
            if (!Directory.Exists(_kbDirectory))
            {
                Console.WriteLine($"[KnowledgeBaseService Warning]: Directory not found at {_kbDirectory}");
                return;
            }

            var files = Directory.GetFiles(_kbDirectory, "*.md");
            var tempChunks = new List<KbChunk>();

            foreach (var file in files)
            {
                var content = File.ReadAllText(file, Encoding.UTF8);
                var fileName = Path.GetFileName(file);
                
                // Chunk by headers or major sections
                var sections = ChunkMarkdown(content);
                foreach (var section in sections)
                {
                    if (string.IsNullOrWhiteSpace(section.Content)) continue;

                    var chunk = new KbChunk
                    {
                        SourceFile = fileName,
                        Header = section.Header,
                        Content = section.Content,
                        Tokens = Tokenize(section.Content)
                    };
                    tempChunks.Add(chunk);
                }
            }

            _chunks = tempChunks;
            Console.WriteLine($"[KnowledgeBaseService]: Loaded {_chunks.Count} chunks from {files.Length} files.");
        }

        private (string Header, string Content)[] ChunkMarkdown(string markdown)
        {
            var lines = markdown.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var result = new List<(string Header, string Content)>();
            
            var currentHeader = "General";
            var currentContent = new StringBuilder();

            foreach (var line in lines)
            {
                if (line.StartsWith("#"))
                {
                    // Save previous section if not empty
                    if (currentContent.Length > 0)
                    {
                        result.Add((currentHeader, currentContent.ToString().Trim()));
                        currentContent.Clear();
                    }
                    currentHeader = line.TrimStart('#').Trim();
                    currentContent.AppendLine(line);
                }
                else
                {
                    currentContent.AppendLine(line);
                }
            }

            if (currentContent.Length > 0)
            {
                result.Add((currentHeader, currentContent.ToString().Trim()));
            }

            return result.ToArray();
        }

        public string Search(string query, int topK = 3)
        {
            var queryTokens = Tokenize(query);
            if (queryTokens.Count == 0 || _chunks.Count == 0) return string.Empty;

            var scoredChunks = new List<(KbChunk Chunk, double Score)>();

            foreach (var chunk in _chunks)
            {
                double score = CalculateScore(queryTokens, chunk.Tokens, chunk.Content, query);
                if (score > 0)
                {
                    scoredChunks.Add((chunk, score));
                }
            }

            // Order by score descending
            var topChunks = scoredChunks
                .OrderByDescending(x => x.Score)
                .Take(topK)
                .Select(x => x.Chunk)
                .ToList();

            if (!topChunks.Any())
            {
                return string.Empty;
            }

            var contextBuilder = new StringBuilder();
            foreach (var chunk in topChunks)
            {
                contextBuilder.AppendLine($"--- Source: {chunk.SourceFile} ({chunk.Header}) ---");
                contextBuilder.AppendLine(chunk.Content);
                contextBuilder.AppendLine();
            }

            return contextBuilder.ToString().Trim();
        }

        private double CalculateScore(List<string> queryTokens, List<string> chunkTokens, string chunkContent, string queryRaw)
        {
            double score = 0;

            // 1. Keyword overlap
            int matches = 0;
            foreach (var qToken in queryTokens)
            {
                if (chunkTokens.Contains(qToken))
                {
                    matches++;
                }
            }

            if (queryTokens.Count > 0)
            {
                score += (double)matches / queryTokens.Count * 10.0;
            }

            // 2. Exact match check (gives a boost to exact phrase matches)
            if (chunkContent.Contains(queryRaw, StringComparison.OrdinalIgnoreCase))
            {
                score += 5.0;
            }
            else
            {
                // Substring matches for individual terms
                foreach (var qToken in queryTokens)
                {
                    if (qToken.Length > 1 && chunkContent.Contains(qToken, System.StringComparison.OrdinalIgnoreCase))
                    {
                        score += 0.5;
                    }
                }
            }

            // 3. Document length penalty reduction (prefer shorter, highly relevant matches)
            // Divide by log of word count to normalize slightly but not penalize long detailed answers too much
            double lengthFactor = Math.Log(chunkTokens.Count + 2);
            score = score / lengthFactor;

            return score;
        }

        private List<string> Tokenize(string text)
        {
            var tokens = new List<string>();
            if (string.IsNullOrWhiteSpace(text)) return tokens;

            var cleaned = text.ToLowerInvariant();

            // Extract English words
            var wordRegex = new Regex(@"[a-z0-9]+", RegexOptions.Compiled);
            foreach (Match match in wordRegex.Matches(cleaned))
            {
                if (match.Value.Length > 1) // skip single char particles in English
                {
                    tokens.Add(match.Value);
                }
            }

            // Extract CJK characters and generate bigrams for Japanese
            // CJK Unified Ideographs block: 4E00-9FFF
            // Hiragana: 3040-309F
            // Katakana: 30A0-30FF
            var cjkChars = new List<char>();
            foreach (var ch in cleaned)
            {
                if (IsCjk(ch))
                {
                    cjkChars.Add(ch);
                }
                else if (cjkChars.Count > 0)
                {
                    // Generate bigrams from accumulated CJK characters
                    tokens.AddRange(GenerateBigrams(cjkChars));
                    cjkChars.Clear();
                }
            }
            if (cjkChars.Count > 0)
            {
                tokens.AddRange(GenerateBigrams(cjkChars));
            }

            return tokens.Distinct().ToList();
        }

        private bool IsCjk(char ch)
        {
            return (ch >= 0x4E00 && ch <= 0x9FFF) || // Kanji / Han
                   (ch >= 0x3040 && ch <= 0x309F) || // Hiragana
                   (ch >= 0x30A0 && ch <= 0x30FF) || // Katakana
                   (ch >= 0xFF00 && ch <= 0xFFEF);   // Full-width latin/punctuation
        }

        private List<string> GenerateBigrams(List<char> chars)
        {
            var bigrams = new List<string>();
            // Add individual characters too
            foreach (var ch in chars)
            {
                bigrams.Add(ch.ToString());
            }

            // Add bigrams
            for (int i = 0; i < chars.Count - 1; i++)
            {
                bigrams.Add($"{chars[i]}{chars[i + 1]}");
            }
            return bigrams;
        }
    }
}
