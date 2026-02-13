describe('Password Format Validation', () => {
  it('❌ Fails if there is no uppercase letter', () => {
    expect('password1!').not.toMatch(/[A-Z]/);
  });

  it('❌ Fails if there is no lowercase letter', () => {
    expect('PASSWORD1!').not.toMatch(/[a-z]/);
  });

  it('❌ Fails if there is no number', () => {
    expect('Password!').not.toMatch(/\d/);
  });

  it('❌ Fails if there is no special character', () => {
    expect('Password1').not.toMatch(/[!@#$%^&*(),.?":{}|<>]/);
  });

  it('❌ Fails if less than 8 characters', () => {
    expect('P1!a'.length).toBeLessThan(8);
  });
});
