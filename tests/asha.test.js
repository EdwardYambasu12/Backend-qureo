const request = require('supertest');
const axios = require('axios');
const { app } = require('../index');

jest.mock('axios');

describe('POST /api/asha/chat', () => {
  it('returns a reply when messages provided', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'Based on your symptoms, rest and hydrate.' } }] } });

    const res = await request(app)
      .post('/api/asha/chat')
      .send({ messages: [{ role: 'user', content: 'I have a headache and fever' }] })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body.reply).toContain('Based on your symptoms');
  });

  it('returns 400 for missing messages', async () => {
    const res = await request(app)
      .post('/api/asha/chat')
      .send({})
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
  });
});
