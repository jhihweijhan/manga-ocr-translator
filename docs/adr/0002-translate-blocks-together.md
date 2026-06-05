# Translate Text Blocks Together

The translation stage sends all text blocks from a translation task to the selected translation model in one request. Manga dialogue often depends on surrounding context, so translating blocks independently would risk inconsistent tone, names, and pronouns; the model response must preserve the input block order.
