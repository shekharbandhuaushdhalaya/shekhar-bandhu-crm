const fs = require('fs');
let file = fs.readFileSync('/Users/pawankeshar/Desktop/shekhar-bandhu-crm/admin-crm/app/inventories.tsx', 'utf8');

// Fix 1: transfers renderTableRow
file = file.replace(
`                        )}
                      </View>
                      </View>
                    </View>
                )}
              />`,
`                        )}
                      </View>
                    </View>
                )}
              />`
);

// Fix 2: deadStockItems renderTableRow
file = file.replace(
`                        <Text style={[styles.tableCell, { textAlign: 'right', color: colors.danger, fontWeight: '700' }]}>{item.daysSinceMovement} Days</Text>
                      </View>
                      </View>
                    </View>
                )}
              />`,
`                        <Text style={[styles.tableCell, { textAlign: 'right', color: colors.danger, fontWeight: '700' }]}>{item.daysSinceMovement} Days</Text>
                      </View>
                    </View>
                )}
              />`
);

// Fix 3: deadStockItems totals row
file = file.replace(
`                        </Text>
                      </View>
                      <View style={[styles.tableCellContainer, { flex: 1.2, borderRightWidth: 0 }]} />
                      </View>
                    </View>
                  )}
            </View>`,
`                        </Text>
                      </View>
                      <View style={[styles.tableCellContainer, { flex: 1.2, borderRightWidth: 0 }]} />
                    </View>
                  )}
            </View>`
);

fs.writeFileSync('/Users/pawankeshar/Desktop/shekhar-bandhu-crm/admin-crm/app/inventories.tsx', file);
